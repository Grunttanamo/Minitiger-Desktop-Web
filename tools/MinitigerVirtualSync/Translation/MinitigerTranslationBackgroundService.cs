using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MinitigerVirtualSync.Translation;

public sealed class MinitigerTranslationBackgroundService : BackgroundService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private static readonly Regex SourceBracketRegex = new(@"[\[(]\s*(?:quelle|source)\s*:\s*[^\]\)]*[\])]", RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex SourceLineRegex = new(@"(^|\n)\s*(?:quelle|source)\s*:\s*[^\n]*(?=\n|$)", RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex HtmlRegex = new(@"<[^>]*>", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex BbCodeRegex = new(@"\[/?(?:b|i|u|em|strong|p|br|span|div|color|size|url)(?:=[^\]]*)?\]", RegexOptions.IgnoreCase | RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly HashSet<string> EnglishWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "for", "from", "with", "without", "into", "through", "after", "before", "when", "while", "who", "whose", "his", "her", "their", "they", "he", "she", "is", "are", "was", "were", "has", "have", "had", "this", "that", "these", "those", "but", "as", "by", "about", "new", "one", "becomes", "must", "can", "will", "finds", "tries", "returns", "discovers", "against", "between", "world", "life", "story"
    };

    private static readonly HashSet<string> GermanWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "einem", "einen", "und", "oder", "von", "zu", "zum", "zur", "im", "in", "auf", "mit", "ohne", "für", "nach", "vor", "als", "bei", "durch", "über", "unter", "ist", "sind", "war", "waren", "hat", "haben", "dieser", "diese", "dieses", "aber", "nicht", "sich", "sein", "seine", "ihr", "ihre", "aus", "wird", "werden", "gegen", "zwischen", "leben", "geschichte"
    };

    private readonly ILibraryManager _libraryManager;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<MinitigerTranslationBackgroundService> _logger;
    private readonly SemaphoreSlim _ioLock = new(1, 1);
    private readonly SemaphoreSlim _runLock = new(1, 1);
    private readonly object _statusLock = new();
    private readonly object _runCancellationLock = new();
    private MinitigerTranslationBackgroundStatus _status = new();
    private CancellationTokenSource? _activeRunCancellation;
    private volatile bool _runRequested;

    public MinitigerTranslationBackgroundService(
        ILibraryManager libraryManager,
        IHttpClientFactory httpClientFactory,
        ILogger<MinitigerTranslationBackgroundService> logger)
    {
        _libraryManager = libraryManager;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public Task<MinitigerTranslationBackgroundSettings> GetSettingsAsync(
        CancellationToken cancellationToken)
        => LoadSettingsAsync(cancellationToken);

    public IReadOnlyList<MinitigerTranslationLibraryInfo> GetLibraries()
    {
        return _libraryManager
            .GetVirtualFolders()
            .Where(folder =>
                !string.IsNullOrWhiteSpace(folder.ItemId)
                && (
                    string.Equals(
                        folder.CollectionType?.ToString(),
                        "tvshows",
                        StringComparison.OrdinalIgnoreCase)
                    || string.Equals(
                        folder.CollectionType?.ToString(),
                        "movies",
                        StringComparison.OrdinalIgnoreCase)
                ))
            .Select(folder => new MinitigerTranslationLibraryInfo
            {
                Id = folder.ItemId ?? string.Empty,
                Name = folder.Name ?? string.Empty,
                CollectionType =
                    folder.CollectionType?.ToString()
                    ?? string.Empty
            })
            .OrderBy(
                folder => folder.Name,
                StringComparer.CurrentCultureIgnoreCase)
            .ToArray();
    }

    public async Task SaveSettingsAsync(
        MinitigerTranslationBackgroundSettings incoming,
        CancellationToken cancellationToken)
    {
        var existing = await LoadSettingsAsync(cancellationToken)
            .ConfigureAwait(false);
        var normalized = incoming.Normalize();

        if (
            string.IsNullOrWhiteSpace(normalized.ApiKey)
            && existing.HasApiKey)
        {
            normalized.ApiKey = existing.ApiKey;
        }

        await SaveSettingsFileAsync(
            normalized,
            cancellationToken).ConfigureAwait(false);

        lock (_statusLock)
        {
            _status.Enabled = normalized.Enabled;
            _status.Mode = normalized.Mode;
            _status.ConfiguredLibraries =
                normalized.LibraryIds.Length;
            _status.NextRunUtc = normalized.Enabled
                ? DateTimeOffset.UtcNow
                : null;
            _status.State = normalized.Enabled
                ? "waiting"
                : "disabled";
            _status.Message = normalized.Enabled
                ? "Hintergrundbetrieb aktiviert. Nächster Lauf wird vorbereitet."
                : "Hintergrundbetrieb deaktiviert.";
        }
    }

    public MinitigerTranslationBackgroundStatus GetStatus()
    {
        lock (_statusLock)
        {
            return CloneStatus(_status);
        }
    }

    public void RequestRunNow()
    {
        _runRequested = true;

        lock (_statusLock)
        {
            if (!_status.Running)
            {
                _status.State = "queued";
                _status.Message =
                    "Manueller Hintergrundlauf angefordert …";
                _status.NextRunUtc = DateTimeOffset.UtcNow;
            }
        }
    }

    public async Task StopAsync(
        CancellationToken cancellationToken)
    {
        var settings = await LoadSettingsAsync(
            cancellationToken).ConfigureAwait(false);

        settings.Enabled = false;

        await SaveSettingsFileAsync(
            settings.Normalize(),
            cancellationToken).ConfigureAwait(false);

        _runRequested = false;

        lock (_runCancellationLock)
        {
            _activeRunCancellation?.Cancel();
        }

        lock (_statusLock)
        {
            _status.Enabled = false;
            _status.NextRunUtc = null;

            if (_status.Running)
            {
                _status.State = "stopping";
                _status.Message =
                    "Stop angefordert. Aktuelle OpenAI-/Jellyfin-Operation wird sauber abgebrochen …";
            }
            else
            {
                _status.State = "disabled";
                _status.Message =
                    "Hintergrundbetrieb sauber gestoppt.";
            }
        }
    }

    public async Task<MinitigerTranslationApiTestResult> TestApiAsync(
        MinitigerTranslationApiTestRequest requestValue,
        CancellationToken cancellationToken)
    {
        var stored = await LoadSettingsAsync(
            cancellationToken).ConfigureAwait(false);

        var apiKey =
            string.IsNullOrWhiteSpace(requestValue.ApiKey)
                ? stored.ApiKey
                : requestValue.ApiKey.Trim();

        var model =
            string.IsNullOrWhiteSpace(requestValue.Model)
                ? stored.Model
                : requestValue.Model.Trim();

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return RecordApiTest(
                false,
                0,
                model,
                "Kein API-Key vorhanden.");
        }

        if (string.IsNullOrWhiteSpace(model))
        {
            model = "gpt-5.6-luna";
        }

        try
        {
            var client =
                _httpClientFactory.CreateClient(
                    "MinitigerTranslation");

            using var request = new HttpRequestMessage(
                HttpMethod.Get,
                $"models/{Uri.EscapeDataString(model)}");

            request.Headers.Authorization =
                new AuthenticationHeaderValue(
                    "Bearer",
                    apiKey);

            using var response =
                await client.SendAsync(
                    request,
                    HttpCompletionOption.ResponseContentRead,
                    cancellationToken).ConfigureAwait(false);

            var body =
                await response.Content.ReadAsStringAsync(
                    cancellationToken).ConfigureAwait(false);

            if (response.IsSuccessStatusCode)
            {
                var returnedModel = model;

                try
                {
                    using var document =
                        JsonDocument.Parse(
                            string.IsNullOrWhiteSpace(body)
                                ? "{}"
                                : body);

                    if (
                        document.RootElement.TryGetProperty(
                            "id",
                            out var id)
                        && id.ValueKind
                            == JsonValueKind.String)
                    {
                        returnedModel =
                            id.GetString()
                            ?? model;
                    }
                }
                catch (JsonException)
                {
                    // Successful HTTP response is enough for validation.
                }

                return RecordApiTest(
                    true,
                    (int)response.StatusCode,
                    returnedModel,
                    $"API-Key gültig. Modell „{returnedModel}“ ist verfügbar.");
            }

            var errorMessage =
                TryGetOpenAiErrorMessage(body)
                ?? $"OpenAI HTTP {(int)response.StatusCode}.";

            return RecordApiTest(
                false,
                (int)response.StatusCode,
                model,
                errorMessage);
        }
        catch (Exception ex)
        {
            return RecordApiTest(
                false,
                0,
                model,
                ex.Message);
        }
    }

    private MinitigerTranslationApiTestResult RecordApiTest(
        bool ok,
        int statusCode,
        string model,
        string message)
    {
        lock (_statusLock)
        {
            _status.LastApiTestUtc =
                DateTimeOffset.UtcNow;
            _status.LastApiTestOk = ok;
            _status.LastApiTestMessage =
                message;

            if (!ok)
            {
                _status.LastError = message;
            }
        }

        return new MinitigerTranslationApiTestResult
        {
            Ok = ok,
            StatusCode = statusCode,
            Model = model,
            Message = message
        };
    }

    private async Task RunHeartbeatLoopAsync(
        CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            lock (_statusLock)
            {
                _status.WorkerOnline = true;
                _status.HeartbeatUtc =
                    DateTimeOffset.UtcNow;
            }

            try
            {
                await Task.Delay(
                    TimeSpan.FromSeconds(5),
                    stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
                when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    // MINITIGER_PATCH_MARKER: PHASE_18_19_2_BACKGROUND_HEARTBEAT
    protected override async Task ExecuteAsync(
        CancellationToken stoppingToken)
    {
        /*
         * Safety rule: background translation never resumes automatically
         * merely because Jellyfin or the plugin restarted. A previous
         * "Speichern & starten" state can otherwise survive a restart and
         * immediately launch a large library scan while the server itself
         * is still starting. The user must explicitly start automation
         * again from the Minitiger settings for each server session.
         */
        try
        {
            var startupSettings =
                await LoadSettingsAsync(
                    stoppingToken).ConfigureAwait(false);

            if (startupSettings.Enabled)
            {
                startupSettings.Enabled = false;

                await SaveSettingsFileAsync(
                    startupSettings.Normalize(),
                    stoppingToken).ConfigureAwait(false);

                _logger.LogInformation(
                    "Minitiger background translation was armed before restart; startup safety disabled automatic resume.");
            }
        }
        catch (OperationCanceledException)
            when (stoppingToken.IsCancellationRequested)
        {
            return;
        }
        catch (Exception startupError)
        {
            _logger.LogWarning(
                startupError,
                "Minitiger could not apply translation startup safety.");
        }

        /*
         * Keep the heartbeat independent from RunOnceAsync().
         * A scan or an OpenAI request can take much longer than the UI's
         * stale-heartbeat window, so the outer worker loop alone is not
         * sufficient to prove that the hosted service is still alive.
         */
        var heartbeatTask =
            RunHeartbeatLoopAsync(stoppingToken);

        lock (_statusLock)
        {
            _status.WorkerOnline = true;
            _status.WorkerStartedUtc =
                DateTimeOffset.UtcNow;
            _status.HeartbeatUtc =
                DateTimeOffset.UtcNow;
            _status.State = "starting";
            _status.Message =
                "Hintergrunddienst gestartet.";
        }

        _logger.LogInformation(
            "Minitiger background translation worker started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var settings =
                    await LoadSettingsAsync(
                        stoppingToken).ConfigureAwait(false);

                lock (_statusLock)
                {
                    _status.WorkerOnline = true;
                    _status.HeartbeatUtc =
                        DateTimeOffset.UtcNow;
                    _status.Enabled =
                        settings.Enabled;
                    _status.Mode =
                        settings.Mode;
                    _status.ConfiguredLibraries =
                        settings.LibraryIds.Length;

                    if (
                        !settings.Enabled
                        && !_status.Running
                        && !_runRequested)
                    {
                        _status.State = "disabled";
                        _status.Message =
                            "Hintergrunddienst online, Automatik deaktiviert.";
                        _status.NextRunUtc = null;
                    }
                }

                var status = GetStatus();
                var due =
                    settings.Enabled
                    && (
                        !status.NextRunUtc.HasValue
                        || status.NextRunUtc.Value
                            <= DateTimeOffset.UtcNow
                    );

                if (_runRequested || due)
                {
                    _runRequested = false;

                    using var linkedCancellation =
                        CancellationTokenSource
                            .CreateLinkedTokenSource(
                                stoppingToken);

                    lock (_runCancellationLock)
                    {
                        _activeRunCancellation =
                            linkedCancellation;
                    }

                    try
                    {
                        await RunOnceAsync(
                            settings,
                            linkedCancellation.Token)
                            .ConfigureAwait(false);
                    }
                    catch (OperationCanceledException)
                        when (
                            !stoppingToken
                                .IsCancellationRequested)
                    {
                        lock (_statusLock)
                        {
                            _status.Running = false;
                            _status.State = "disabled";
                            _status.Enabled = false;
                            _status.CurrentItem =
                                string.Empty;
                            _status.NextRunUtc = null;
                            _status.Message =
                                "Hintergrundlauf sauber gestoppt.";
                        }
                    }
                    finally
                    {
                        lock (_runCancellationLock)
                        {
                            if (
                                ReferenceEquals(
                                    _activeRunCancellation,
                                    linkedCancellation))
                            {
                                _activeRunCancellation = null;
                            }
                        }
                    }
                }
                else if (
                    settings.Enabled
                    && !status.NextRunUtc.HasValue)
                {
                    lock (_statusLock)
                    {
                        _status.State = "waiting";
                        _status.Message =
                            settings.IsContinuous111
                                ? "Dauerhaftes 1→1→1 ist aktiv und wartet auf den nächsten Scan."
                                : "Hintergrundbetrieb aktiv und wartet auf den nächsten Lauf.";
                        _status.NextRunUtc =
                            DateTimeOffset.UtcNow
                                .AddMinutes(
                                    settings.IntervalMinutes);
                    }
                }
            }
            catch (OperationCanceledException)
                when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Minitiger background translation loop failed.");

                /*
                 * A failed translation pass must not silently retry forever.
                 * Large scans + repeated OpenAI failures can create sustained
                 * DB pressure. Disable persisted automation and wait for an
                 * explicit user start instead.
                 */
                try
                {
                    var failedSettings =
                        await LoadSettingsAsync(
                            stoppingToken).ConfigureAwait(false);

                    if (failedSettings.Enabled)
                    {
                        failedSettings.Enabled = false;

                        await SaveSettingsFileAsync(
                            failedSettings.Normalize(),
                            stoppingToken).ConfigureAwait(false);
                    }
                }
                catch (OperationCanceledException)
                    when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception disableError)
                {
                    _logger.LogWarning(
                        disableError,
                        "Minitiger could not persist translation auto-disable after an error.");
                }

                _runRequested = false;

                lock (_statusLock)
                {
                    _status.Running = false;
                    _status.Enabled = false;
                    _status.State = "error";
                    _status.Errors += 1;
                    _status.LastError =
                        ex.Message;
                    _status.Message =
                        $"Hintergrunddienst-Fehler: {ex.Message} · Automatik wurde zur Sicherheit deaktiviert.";
                    _status.NextRunUtc = null;
                }
            }

            try
            {
                await Task.Delay(
                    TimeSpan.FromSeconds(5),
                    stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        /*
         * The heartbeat loop uses the same host cancellation token and
         * therefore finishes immediately when Jellyfin stops the service.
         * Await it before publishing the final offline state so it cannot
         * race and set WorkerOnline=true again afterwards.
         */
        await heartbeatTask.ConfigureAwait(false);

        lock (_statusLock)
        {
            _status.WorkerOnline = false;
            _status.Running = false;
            _status.State = "offline";
            _status.CurrentItem = string.Empty;
            _status.NextRunUtc = null;
            _status.Message =
                "Hintergrunddienst wurde mit Jellyfin beendet.";
        }

        _logger.LogInformation(
            "Minitiger background translation worker stopped.");
    }

    private async Task RunOnceAsync(
        MinitigerTranslationBackgroundSettings rawSettings,
        CancellationToken cancellationToken)
    {
        if (
            !await _runLock.WaitAsync(
                0,
                cancellationToken).ConfigureAwait(false))
        {
            return;
        }

        try
        {
            var settings =
                rawSettings.Normalize();

            if (!settings.ScanTitles && !settings.ScanOverviews)
            {
                FinishWithoutRun(
                    settings,
                    "Titel und Beschreibungen sind beide deaktiviert.");
                return;
            }

            if (!settings.HasApiKey)
            {
                FinishWithoutRun(
                    settings,
                    "Kein OpenAI API-Key für den Hintergrunddienst gespeichert.");
                return;
            }

            if (settings.LibraryIds.Length == 0)
            {
                FinishWithoutRun(
                    settings,
                    "Keine Bibliotheken für den Hintergrunddienst ausgewählt.");
                return;
            }

            var itemKinds =
                BuildItemKinds(settings);

            if (itemKinds.Length == 0)
            {
                FinishWithoutRun(
                    settings,
                    "Keine Inhaltstypen für den Hintergrunddienst ausgewählt.");
                return;
            }

            var availableLibraries =
                GetLibraries();

            var availableById =
                availableLibraries.ToDictionary(
                    library => library.Id,
                    StringComparer.OrdinalIgnoreCase);

            var selectedLibraries =
                settings.LibraryIds
                    .Where(id =>
                        availableById.ContainsKey(id))
                    .Select(id =>
                        availableById[id])
                    .ToArray();

            lock (_statusLock)
            {
                _status.Enabled =
                    settings.Enabled;
                _status.Mode =
                    settings.Mode;
                _status.ConfiguredLibraries =
                    settings.LibraryIds.Length;
                _status.ResolvedLibraries =
                    selectedLibraries.Length;
            }

            if (selectedLibraries.Length == 0)
            {
                FinishWithoutRun(
                    settings,
                    "Keine der gespeicherten Bibliotheks-IDs entspricht einer echten Jellyfin-Serverbibliothek. Bitte die Bibliotheken im Hintergrundbereich einmal neu auswählen und speichern.");
                return;
            }

            _logger.LogInformation(
                "Minitiger background translation run starting. Mode={Mode}, Libraries={Libraries}, Items={ItemKinds}.",
                settings.Mode,
                string.Join(",", selectedLibraries.Select(library => library.Name)),
                string.Join(",", itemKinds));

            var continuous111 =
                settings.IsContinuous111;

            var effectiveBatchSize =
                continuous111
                    ? 1
                    : settings.BatchSize;

            var effectiveMaxPerRun =
                settings.MaxPerRun;

            lock (_statusLock)
            {
                _status.Running = true;
                _status.State = "running";
                _status.CurrentItem =
                    string.Empty;
                _status.LastError =
                    string.Empty;
                _status.Checked = 0;
                _status.Found = 0;
                _status.Applied = 0;
                _status.Errors = 0;
                _status.InputTokens = 0;
                _status.OutputTokens = 0;
                _status.Message =
                    continuous111
                        ? "Dauerhaftes 1→1→1 läuft …"
                        : "Hintergrund-Übersetzung läuft …";
            }

            var processed =
                await LoadProcessedAsync(
                    cancellationToken).ConfigureAwait(false);

            var batch =
                new List<MinitigerTranslationCandidate>(
                    Math.Max(
                        1,
                        effectiveBatchSize));

            foreach (var selectedLibrary in selectedLibraries)
            {
                cancellationToken.ThrowIfCancellationRequested();

                if (
                    !Guid.TryParse(
                        selectedLibrary.Id,
                        out var libraryId))
                {
                    IncrementError(
                        $"Ungültige Server-Bibliotheks-ID: {selectedLibrary.Id}");
                    continue;
                }

                var startIndex = 0;

                while (!cancellationToken.IsCancellationRequested)
                {
                    var query =
                        new InternalItemsQuery
                        {
                            ParentId = libraryId,
                            Recursive = true,
                            IncludeItemTypes =
                                itemKinds,
                            IsVirtualItem = false,
                            GroupByPresentationUniqueKey =
                                false,
                            EnableTotalRecordCount =
                                false,
                            StartIndex =
                                startIndex,
                            Limit = 200
                        };

                    var items =
                        _libraryManager.GetItemList(
                            query);

                    if (items.Count == 0)
                    {
                        break;
                    }

                    foreach (var item in items)
                    {
                        cancellationToken
                            .ThrowIfCancellationRequested();

                        lock (_statusLock)
                        {
                            _status.Checked += 1;
                            _status.CurrentItem =
                                item.Name
                                ?? item.Id.ToString("D");
                            _status.Message =
                                continuous111
                                    ? $"1→1→1 · Prüfe: {_status.CurrentItem} · {_status.Checked} geprüft · {_status.Found} Kandidaten · {_status.Applied} übernommen"
                                    : $"Prüfe: {_status.CurrentItem} · {_status.Checked} geprüft · {_status.Found} englisch · {_status.Applied} übernommen";
                        }

                        var id =
                            item.Id.ToString("D");

                        var signature =
                            ComputeSignature(item);

                        if (
                            processed.TryGetValue(
                                id,
                                out var previousSignature)
                            && string.Equals(
                                previousSignature,
                                signature,
                                StringComparison.Ordinal))
                        {
                            continue;
                        }

                        var candidate =
                            CreateCandidate(
                                item,
                                settings);

                        if (candidate is null)
                        {
                            continue;
                        }

                        lock (_statusLock)
                        {
                            _status.Found += 1;
                            _status.CurrentItem =
                                candidate.Item.Name
                                ?? candidate.Item.Id.ToString("D");
                        }

                        batch.Add(candidate);

                        if (
                            batch.Count
                                >= effectiveBatchSize
                            || GetStatus().Found
                                >= effectiveMaxPerRun)
                        {
                            await TranslateAndApplyBatchAsync(
                                batch,
                                settings,
                                processed,
                                cancellationToken)
                                .ConfigureAwait(false);

                            batch.Clear();

                            if (continuous111)
                            {
                                await SaveProcessedAsync(
                                    processed,
                                    cancellationToken)
                                    .ConfigureAwait(false);
                            }
                        }

                        if (
                            GetStatus().Found
                                >= effectiveMaxPerRun)
                        {
                            break;
                        }
                    }

                    if (
                        GetStatus().Found
                            >= effectiveMaxPerRun)
                    {
                        break;
                    }

                    startIndex += items.Count;
                }

                if (
                    GetStatus().Found
                        >= effectiveMaxPerRun)
                {
                    break;
                }
            }

            if (batch.Count > 0)
            {
                await TranslateAndApplyBatchAsync(
                    batch,
                    settings,
                    processed,
                    cancellationToken)
                    .ConfigureAwait(false);
            }

            await SaveProcessedAsync(
                processed,
                cancellationToken).ConfigureAwait(false);

            lock (_statusLock)
            {
                _status.Running = false;
                _status.State =
                    settings.Enabled
                        ? "waiting"
                        : "disabled";
                _status.CurrentItem =
                    string.Empty;
                _status.LastRunUtc =
                    DateTimeOffset.UtcNow;
                _status.NextRunUtc =
                    settings.Enabled
                        ? DateTimeOffset.UtcNow
                            .AddMinutes(
                                settings.IntervalMinutes)
                        : null;

                _status.Message =
                    continuous111
                        ? $"1→1→1-Runde fertig ♥ {_status.Checked} geprüft · {_status.Found} Kandidaten · {_status.Applied} übernommen · {_status.Errors} Fehler. Dienst bleibt aktiv und prüft nach {settings.IntervalMinutes} Minute(n) erneut."
                        : $"Hintergrundlauf fertig ♥ {_status.Checked} geprüft · {_status.Found} englisch · {_status.Applied} übernommen · {_status.Errors} Fehler.";
            }

            _logger.LogInformation(
                "Minitiger background translation run finished. Checked={Checked}, Found={Found}, Applied={Applied}, Errors={Errors}.",
                GetStatus().Checked,
                GetStatus().Found,
                GetStatus().Applied,
                GetStatus().Errors);
        }
        finally
        {
            _runLock.Release();
        }
    }

    private void FinishWithoutRun(
        MinitigerTranslationBackgroundSettings settings,
        string message)
    {
        lock (_statusLock)
        {
            _status.Running = false;
            _status.State =
                settings.Enabled
                    ? "waiting"
                    : "disabled";
            _status.Enabled =
                settings.Enabled;
            _status.Mode =
                settings.Mode;
            _status.CurrentItem =
                string.Empty;
            _status.Message = message;
            _status.LastRunUtc =
                DateTimeOffset.UtcNow;
            _status.NextRunUtc =
                settings.Enabled
                    ? DateTimeOffset.UtcNow
                        .AddMinutes(
                            settings.IntervalMinutes)
                    : null;
        }
    }

    private static BaseItemKind[] BuildItemKinds(MinitigerTranslationBackgroundSettings settings)
    {
        var result = new List<BaseItemKind>();
        if (settings.ItemSeries) result.Add(BaseItemKind.Series);
        if (settings.ItemSeasons) result.Add(BaseItemKind.Season);
        if (settings.ItemEpisodes) result.Add(BaseItemKind.Episode);
        if (settings.ItemMovies) result.Add(BaseItemKind.Movie);
        return result.Distinct().ToArray();
    }

    private static MinitigerTranslationCandidate? CreateCandidate(BaseItem item, MinitigerTranslationBackgroundSettings settings)
    {
        var rawName = (item.Name ?? string.Empty).Trim();
        var rawOverview = (item.Overview ?? string.Empty).Trim();
        var cleanName = settings.CleanMetadata ? CleanMetadataText(rawName) : rawName;
        var cleanOverview = settings.CleanMetadata ? CleanMetadataText(rawOverview) : rawOverview;
        var titleCandidate = settings.ScanTitles && LikelyEnglishText(cleanName, true, settings.MinTitleWords);
        var overviewCandidate = settings.ScanOverviews && LikelyEnglishText(cleanOverview, false, settings.MinTitleWords);
        if (!titleCandidate && !overviewCandidate) return null;

        return new MinitigerTranslationCandidate
        {
            Item = item,
            RawName = rawName,
            RawOverview = rawOverview,
            CleanName = cleanName,
            CleanOverview = cleanOverview,
            TranslateTitle = titleCandidate,
            TranslateOverview = overviewCandidate
        };
    }

    private async Task TranslateAndApplyBatchAsync(
        IReadOnlyList<MinitigerTranslationCandidate> batch,
        MinitigerTranslationBackgroundSettings settings,
        Dictionary<string, string> processed,
        CancellationToken cancellationToken)
    {
        if (batch.Count == 0) return;

        Dictionary<string, MinitigerTranslatedValue> translations;
        try
        {
            translations = await TranslateBatchAsync(batch, settings, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
            when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Minitiger OpenAI translation batch failed.");

            lock (_statusLock)
            {
                _status.Errors += batch.Count;
                _status.LastError =
                    ex.Message;
                _status.State = "error";
                _status.Message =
                    $"OpenAI-Fehler: {ex.Message}";
            }

            throw new InvalidOperationException(
                $"OpenAI-Fehler: {ex.Message}",
                ex);
        }

        foreach (var candidate in batch)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var id = candidate.Item.Id.ToString("D");
            if (!translations.TryGetValue(id, out var translated))
            {
                IncrementError($"Kein Übersetzungsergebnis für {candidate.Item.Name}.");
                continue;
            }

            try
            {
                var changed = false;
                if (candidate.TranslateTitle && !string.IsNullOrWhiteSpace(translated.Title))
                {
                    var title = settings.CleanMetadata ? CleanMetadataText(translated.Title) : translated.Title.Trim();
                    if (!string.Equals(candidate.Item.Name, title, StringComparison.Ordinal))
                    {
                        candidate.Item.Name = title;
                        changed = true;
                    }
                }
                if (candidate.TranslateOverview && !string.IsNullOrWhiteSpace(translated.Overview))
                {
                    var overview = settings.CleanMetadata ? CleanMetadataText(translated.Overview) : translated.Overview.Trim();
                    if (!string.Equals(candidate.Item.Overview, overview, StringComparison.Ordinal))
                    {
                        candidate.Item.Overview = overview;
                        changed = true;
                    }
                }

                if (changed)
                {
                    await candidate.Item.UpdateToRepositoryAsync(ItemUpdateType.MetadataEdit, cancellationToken).ConfigureAwait(false);
                    lock (_statusLock) _status.Applied += 1;
                }

                processed[id] = ComputeSignature(candidate.Item);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Minitiger could not apply translation for item {ItemId}.", candidate.Item.Id);
                IncrementError($"Übernahme fehlgeschlagen: {candidate.Item.Name}");
            }
        }
    }

    private async Task<Dictionary<string, MinitigerTranslatedValue>> TranslateBatchAsync(
        IReadOnlyList<MinitigerTranslationCandidate> batch,
        MinitigerTranslationBackgroundSettings settings,
        CancellationToken cancellationToken)
    {
        var instructions = settings.ProtectFranchise
            ? "Übersetze Jellyfin-Metadaten von Englisch in natürliches Deutsch. Erhalte etablierte Franchise-/Werktitel, Eigennamen, Marken, Orte und fiktive Begriffe. Erfinde nichts. Titel nur übersetzen, wenn eine natürliche deutsche Fassung sinnvoll ist; sonst unverändert lassen. Beschreibungen sinngemäß und vollständig übersetzen."
            : "Übersetze Jellyfin-Metadaten von Englisch in natürliches Deutsch. Erfinde keine Fakten und erhalte Eigennamen. Titel dürfen übersetzt werden, wenn eine natürliche deutsche Fassung sinnvoll ist. Beschreibungen sinngemäß und vollständig übersetzen.";
        if (settings.CleanMetadata)
        {
            instructions += " Übernimm keine Quellenhinweise wie (Quelle: ...), [Quelle: ...], (Source: ...) oder [Source: ...] und keine HTML-/BBCode-/Pseudo-Markup-Reste in die Ausgabe.";
        }

        var inputItems = batch.Select(candidate => new
        {
            id = candidate.Item.Id.ToString("D"),
            type = candidate.Item.GetBaseItemKind().ToString(),
            translateTitle = candidate.TranslateTitle,
            translateOverview = candidate.TranslateOverview,
            title = candidate.CleanName,
            originalTitle = candidate.Item.OriginalTitle ?? string.Empty,
            overview = candidate.CleanOverview
        }).ToArray();

        var schema = new
        {
            type = "object",
            additionalProperties = false,
            properties = new
            {
                items = new
                {
                    type = "array",
                    items = new
                    {
                        type = "object",
                        additionalProperties = false,
                        properties = new
                        {
                            id = new { type = "string" },
                            title = new { type = "string" },
                            overview = new { type = "string" },
                            note = new { type = "string" }
                        },
                        required = new[] { "id", "title", "overview", "note" }
                    }
                }
            },
            required = new[] { "items" }
        };

        var body = new
        {
            model = settings.Model,
            instructions,
            input = "Zielsprache: Deutsch (de-DE). Bearbeite jedes Element separat. Wenn translateTitle oder translateOverview false ist, gib das jeweilige Originalfeld unverändert zurück. JSON-Eingabe:\n" + JsonSerializer.Serialize(new { items = inputItems }),
            store = false,
            text = new
            {
                format = new { type = "json_schema", name = "minitiger_translation_batch", strict = true, schema },
                verbosity = "low"
            },
            max_output_tokens = Math.Max(1200, batch.Count * 700)
        };

        var client = _httpClientFactory.CreateClient("MinitigerTranslation");
        using var request = new HttpRequestMessage(HttpMethod.Post, "responses");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.ApiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");
        using var response = await client.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellationToken).ConfigureAwait(false);
        var responseText = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(responseText) ? "{}" : responseText);

        if (!response.IsSuccessStatusCode)
        {
            var message = TryGetErrorMessage(document.RootElement) ?? $"OpenAI HTTP {(int)response.StatusCode}";
            throw new InvalidOperationException(message);
        }

        lock (_statusLock)
        {
            if (document.RootElement.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
            {
                if (usage.TryGetProperty("input_tokens", out var inputTokens) && inputTokens.TryGetInt64(out var input)) _status.InputTokens += input;
                if (usage.TryGetProperty("output_tokens", out var outputTokens) && outputTokens.TryGetInt64(out var output)) _status.OutputTokens += output;
            }
        }

        var outputText = ExtractOutputText(document.RootElement);
        if (string.IsNullOrWhiteSpace(outputText)) throw new InvalidOperationException("OpenAI hat keinen strukturierten Übersetzungstext geliefert.");
        using var translatedDocument = JsonDocument.Parse(outputText);
        if (!translatedDocument.RootElement.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidOperationException("OpenAI-Antwort enthält keine Übersetzungs-Liste.");
        }

        var result = new Dictionary<string, MinitigerTranslatedValue>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in items.EnumerateArray())
        {
            var value = new MinitigerTranslatedValue
            {
                Id = item.TryGetProperty("id", out var id) ? id.GetString() ?? string.Empty : string.Empty,
                Title = item.TryGetProperty("title", out var title) ? title.GetString() ?? string.Empty : string.Empty,
                Overview = item.TryGetProperty("overview", out var overview) ? overview.GetString() ?? string.Empty : string.Empty,
                Note = item.TryGetProperty("note", out var note) ? note.GetString() ?? string.Empty : string.Empty
            };
            if (!string.IsNullOrWhiteSpace(value.Id)) result[value.Id] = value;
        }
        return result;
    }

    private static string? TryGetOpenAiErrorMessage(
        string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        try
        {
            using var document =
                JsonDocument.Parse(raw);

            return TryGetErrorMessage(
                document.RootElement);
        }
        catch (JsonException)
        {
            return raw.Length > 500
                ? raw[..500]
                : raw;
        }
    }

    private static string? TryGetErrorMessage(JsonElement root)
    {
        if (root.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.Object && error.TryGetProperty("message", out var message)) return message.GetString();
        return null;
    }

    private static string ExtractOutputText(JsonElement root)
    {
        if (root.TryGetProperty("output_text", out var outputText) && outputText.ValueKind == JsonValueKind.String) return outputText.GetString() ?? string.Empty;
        if (!root.TryGetProperty("output", out var output) || output.ValueKind != JsonValueKind.Array) return string.Empty;
        foreach (var outputItem in output.EnumerateArray())
        {
            if (!outputItem.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array) continue;
            foreach (var contentItem in content.EnumerateArray())
            {
                if (contentItem.TryGetProperty("type", out var type) && string.Equals(type.GetString(), "output_text", StringComparison.Ordinal) && contentItem.TryGetProperty("text", out var text) && text.ValueKind == JsonValueKind.String) return text.GetString() ?? string.Empty;
            }
        }
        return string.Empty;
    }

    private void IncrementError(string message)
    {
        lock (_statusLock)
        {
            _status.Errors += 1;
            _status.LastError = message;
            _status.Message = message;
        }
    }

    private async Task<MinitigerTranslationBackgroundSettings> LoadSettingsAsync(CancellationToken cancellationToken)
    {
        var path = GetSettingsPath();
        if (path is null || !File.Exists(path)) return new MinitigerTranslationBackgroundSettings();
        await _ioLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var json = await File.ReadAllTextAsync(path, Encoding.UTF8, cancellationToken).ConfigureAwait(false);
            return (JsonSerializer.Deserialize<MinitigerTranslationBackgroundSettings>(json, JsonOptions) ?? new MinitigerTranslationBackgroundSettings()).Normalize();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Minitiger background translation settings could not be read.");
            return new MinitigerTranslationBackgroundSettings();
        }
        finally { _ioLock.Release(); }
    }

    private async Task SaveSettingsFileAsync(MinitigerTranslationBackgroundSettings settings, CancellationToken cancellationToken)
    {
        var path = GetSettingsPath() ?? throw new InvalidOperationException("Minitiger plugin data directory is not available.");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temporaryPath = path + ".tmp";
        var json = JsonSerializer.Serialize(settings.Normalize(), JsonOptions);
        await _ioLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await File.WriteAllTextAsync(temporaryPath, json, Encoding.UTF8, cancellationToken).ConfigureAwait(false);
            File.Move(temporaryPath, path, true);
        }
        finally
        {
            try { if (File.Exists(temporaryPath)) File.Delete(temporaryPath); } catch { }
            _ioLock.Release();
        }
    }

    private async Task<Dictionary<string, string>> LoadProcessedAsync(CancellationToken cancellationToken)
    {
        var path = GetProcessedPath();
        if (path is null || !File.Exists(path)) return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            var json = await File.ReadAllTextAsync(path, Encoding.UTF8, cancellationToken).ConfigureAwait(false);
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json, JsonOptions) ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
        catch { return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase); }
    }

    private async Task SaveProcessedAsync(Dictionary<string, string> processed, CancellationToken cancellationToken)
    {
        var path = GetProcessedPath();
        if (path is null) return;
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        try
        {
            await File.WriteAllTextAsync(path, JsonSerializer.Serialize(processed, JsonOptions), Encoding.UTF8, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) { _logger.LogDebug(ex, "Minitiger processed translation signatures could not be stored."); }
    }

    private static string ComputeSignature(BaseItem item)
    {
        var raw = $"{item.Name ?? string.Empty}\u001f{item.Overview ?? string.Empty}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));
    }

    private static MinitigerTranslationBackgroundStatus CloneStatus(
        MinitigerTranslationBackgroundStatus source)
        => new()
        {
            WorkerOnline = source.WorkerOnline,
            WorkerStartedUtc = source.WorkerStartedUtc,
            HeartbeatUtc = source.HeartbeatUtc,
            Enabled = source.Enabled,
            Running = source.Running,
            State = source.State,
            Mode = source.Mode,
            Message = source.Message,
            CurrentItem = source.CurrentItem,
            LastError = source.LastError,
            LastRunUtc = source.LastRunUtc,
            NextRunUtc = source.NextRunUtc,
            LastApiTestUtc = source.LastApiTestUtc,
            LastApiTestOk = source.LastApiTestOk,
            LastApiTestMessage = source.LastApiTestMessage,
            ConfiguredLibraries = source.ConfiguredLibraries,
            ResolvedLibraries = source.ResolvedLibraries,
            Checked = source.Checked,
            Found = source.Found,
            Applied = source.Applied,
            Errors = source.Errors,
            InputTokens = source.InputTokens,
            OutputTokens = source.OutputTokens
        };

    private static string? DataPath(string fileName)
    {
        var dataFolder = Plugin.Instance?.DataFolderPath;
        return string.IsNullOrWhiteSpace(dataFolder) ? null : Path.Combine(dataFolder, fileName);
    }
    private static string? GetSettingsPath() => DataPath("translation-background.json");
    private static string? GetProcessedPath() => DataPath("translation-background-processed.json");

    private static string CleanMetadataText(string? raw)
    {
        var value = raw ?? string.Empty;
        value = SourceBracketRegex.Replace(value, " ");
        value = SourceLineRegex.Replace(value, "$1");
        value = HtmlRegex.Replace(value, " ");
        value = BbCodeRegex.Replace(value, " ");
        value = Regex.Replace(value, @"[ \t]+([,.;:!?])", "$1", RegexOptions.CultureInvariant);
        value = Regex.Replace(value, @"[ \t]{2,}", " ", RegexOptions.CultureInvariant);
        value = Regex.Replace(value, @"[ \t]*\n[ \t]*", "\n", RegexOptions.CultureInvariant);
        value = Regex.Replace(value, @"\n{3,}", "\n\n", RegexOptions.CultureInvariant);
        return value.Trim();
    }

    private static bool LikelyEnglishText(string? text, bool titleMode, int minTitleWords)
    {
        var raw = text ?? string.Empty;
        var words = Regex.Replace(raw.Replace('\u2018', '\'').Replace('\u2019', '\''), @"[^A-Za-zÀ-ÿ0-9'’-]+", " ", RegexOptions.CultureInvariant)
            .Trim()
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (titleMode && words.Length < minTitleWords) return false;
        if (!titleMode && words.Length < 6) return false;
        var englishScore = 0;
        var germanScore = Regex.IsMatch(raw, "[äöüß]", RegexOptions.IgnoreCase) ? 2 : 0;
        foreach (var word in words)
        {
            if (EnglishWords.Contains(word)) englishScore += 1;
            if (GermanWords.Contains(word)) germanScore += 1;
        }
        return titleMode
            ? englishScore >= 1 && englishScore > germanScore
            : englishScore >= 3 && englishScore >= (germanScore * 1.5 + 1);
    }
}

// MINITIGER_PATCH_MARKER: PHASE_18_18_0_BACKGROUND_TRANSLATION_SERVICE

// MINITIGER_PATCH_MARKER: PHASE_18_18_2_BACKGROUND_CONTROL_SERVICE
