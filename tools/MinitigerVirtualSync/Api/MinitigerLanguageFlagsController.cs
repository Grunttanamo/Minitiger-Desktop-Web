using System.Text;
using System.Text.Json;
using MediaBrowser.Common.Api;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MinitigerVirtualSync.Api;

[ApiController]
[Route("Minitiger/LanguageFlags")]
[Authorize]
public sealed class MinitigerLanguageFlagsController : ControllerBase
{
    private static readonly SemaphoreSlim IoLock = new(1, 1);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private static readonly Dictionary<string, string> SupportedLanguages =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["de"] = "Deutsch",
            ["en"] = "Englisch",
            ["ja"] = "Japanisch",
            ["ko"] = "Koreanisch",
            ["zh"] = "Chinesisch",
            ["fr"] = "Französisch",
            ["es"] = "Spanisch",
            ["it"] = "Italienisch",
            ["pt"] = "Portugiesisch",
            ["ru"] = "Russisch",
            ["pl"] = "Polnisch",
            ["nl"] = "Niederländisch",
            ["cs"] = "Tschechisch",
            ["sv"] = "Schwedisch",
            ["no"] = "Norwegisch",
            ["da"] = "Dänisch",
            ["fi"] = "Finnisch",
            ["tr"] = "Türkisch",
            ["uk"] = "Ukrainisch"
        };

    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<MinitigerLanguageFlagsController> _logger;

    public MinitigerLanguageFlagsController(
        ILibraryManager libraryManager,
        ILogger<MinitigerLanguageFlagsController> logger)
    {
        _libraryManager = libraryManager;
        _logger = logger;
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult> GetAll(
        CancellationToken cancellationToken)
    {
        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var state = await LoadStateAsync(cancellationToken)
                .ConfigureAwait(false);

            return Ok(new
            {
                version = state.Version,
                items = state.Items
            });
        }
        finally
        {
            IoLock.Release();
        }
    }

    [HttpGet("{itemId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> GetOne(
        [FromRoute] string itemId,
        CancellationToken cancellationToken)
    {
        if (!TryNormalizeItemId(itemId, out var normalizedId))
        {
            return NotFound();
        }

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var state = await LoadStateAsync(cancellationToken)
                .ConfigureAwait(false);

            if (!state.Items.TryGetValue(normalizedId, out var languages))
            {
                return Ok(new
                {
                    itemId = normalizedId,
                    manual = false,
                    languages = Array.Empty<string>()
                });
            }

            return Ok(new
            {
                itemId = normalizedId,
                manual = true,
                languages
            });
        }
        finally
        {
            IoLock.Release();
        }
    }

    [HttpPut("{itemId}")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> Put(
        [FromRoute] string itemId,
        [FromBody] MinitigerLanguageFlagsUpdateRequest request,
        CancellationToken cancellationToken)
    {
        if (
            !TryNormalizeItemId(itemId, out var normalizedId)
            || !Guid.TryParse(normalizedId, out var itemGuid))
        {
            return NotFound();
        }

        if (_libraryManager.GetItemById(itemGuid) is null)
        {
            return NotFound();
        }

        if (!TryNormalizeLanguages(
            request.Languages,
            out var normalizedLanguages,
            out var validationError))
        {
            return BadRequest(validationError);
        }

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var state = await LoadStateAsync(cancellationToken)
                .ConfigureAwait(false);

            state.Items[normalizedId] = normalizedLanguages;

            await SaveStateAsync(state, cancellationToken)
                .ConfigureAwait(false);

            _logger.LogInformation(
                "Minitiger language flags updated for item {ItemId}: {Languages}",
                normalizedId,
                string.Join(", ", normalizedLanguages));

            return Ok(new
            {
                itemId = normalizedId,
                manual = true,
                languages = normalizedLanguages
            });
        }
        finally
        {
            IoLock.Release();
        }
    }

    [HttpPost("Bulk")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult> PutBulk(
        [FromBody] MinitigerLanguageFlagsBulkUpdateRequest request,
        CancellationToken cancellationToken)
    {
        var rawIds =
            request.ItemIds
            ?? new List<string>();

        if (
            rawIds.Count == 0
            || rawIds.Count > 5000)
        {
            return BadRequest(
                "Bulk language flag updates require 1-5000 item ids.");
        }

        if (!TryNormalizeLanguages(
            request.Languages,
            out var normalizedLanguages,
            out var validationError))
        {
            return BadRequest(validationError);
        }

        var normalizedIds =
            new HashSet<string>(
                StringComparer.OrdinalIgnoreCase);

        foreach (var rawId in rawIds)
        {
            if (
                !TryNormalizeItemId(
                    rawId,
                    out var normalizedId)
                || !Guid.TryParse(
                    normalizedId,
                    out var itemGuid))
            {
                continue;
            }

            if (_libraryManager.GetItemById(itemGuid) is null)
            {
                continue;
            }

            normalizedIds.Add(
                normalizedId
            );
        }

        if (normalizedIds.Count == 0)
        {
            return BadRequest(
                "No valid Jellyfin item ids were supplied.");
        }

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var state = await LoadStateAsync(cancellationToken)
                .ConfigureAwait(false);

            foreach (var normalizedId in normalizedIds)
            {
                state.Items[normalizedId] =
                    new List<string>(
                        normalizedLanguages);
            }

            await SaveStateAsync(state, cancellationToken)
                .ConfigureAwait(false);

            _logger.LogInformation(
                "Minitiger language flags bulk-updated for {ItemCount} items: {Languages}",
                normalizedIds.Count,
                string.Join(", ", normalizedLanguages));

            return Ok(new
            {
                updated = normalizedIds.Count,
                itemIds = normalizedIds.ToArray(),
                languages = normalizedLanguages
            });
        }
        finally
        {
            IoLock.Release();
        }
    }

    [HttpDelete("{itemId}")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<ActionResult> Delete(
        [FromRoute] string itemId,
        CancellationToken cancellationToken)
    {
        if (!TryNormalizeItemId(itemId, out var normalizedId))
        {
            return NoContent();
        }

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var state = await LoadStateAsync(cancellationToken)
                .ConfigureAwait(false);

            if (state.Items.Remove(normalizedId))
            {
                await SaveStateAsync(state, cancellationToken)
                    .ConfigureAwait(false);

                _logger.LogInformation(
                    "Minitiger language flag override removed for item {ItemId}.",
                    normalizedId);
            }

            return NoContent();
        }
        finally
        {
            IoLock.Release();
        }
    }

    private static bool TryNormalizeLanguages(
        List<string>? languages,
        out List<string> normalizedLanguages,
        out string validationError)
    {
        normalizedLanguages = new List<string>();
        validationError = string.Empty;

        var seen =
            new HashSet<string>(
                StringComparer.OrdinalIgnoreCase);

        foreach (var raw in languages ?? new List<string>())
        {
            var value =
                raw?.Trim()
                ?? string.Empty;

            if (string.IsNullOrWhiteSpace(value))
            {
                continue;
            }

            string? canonical = null;

            if (SupportedLanguages.TryGetValue(
                value,
                out var byCode))
            {
                canonical = byCode;
            }
            else
            {
                canonical = SupportedLanguages.Values.FirstOrDefault(
                    candidate => string.Equals(
                        candidate,
                        value,
                        StringComparison.OrdinalIgnoreCase));
            }

            if (canonical is null)
            {
                validationError =
                    $"Unsupported Minitiger language flag: {value}";
                return false;
            }

            if (seen.Add(canonical))
            {
                normalizedLanguages.Add(canonical);
            }
        }

        return true;
    }

    private static bool TryNormalizeItemId(
        string? value,
        out string normalized)
    {
        normalized = string.Empty;

        if (
            string.IsNullOrWhiteSpace(value)
            || !Guid.TryParse(value, out var guid)
            || guid == Guid.Empty)
        {
            return false;
        }

        normalized = guid.ToString("N");
        return true;
    }

    private static string GetStatePath()
    {
        var dataFolder = Plugin.Instance?.DataFolderPath;

        if (string.IsNullOrWhiteSpace(dataFolder))
        {
            throw new InvalidOperationException(
                "Minitiger plugin data folder is unavailable.");
        }

        Directory.CreateDirectory(dataFolder);
        return Path.Combine(dataFolder, "language-flags.json");
    }

    private static async Task<MinitigerLanguageFlagsState> LoadStateAsync(
        CancellationToken cancellationToken)
    {
        var path = GetStatePath();

        if (!System.IO.File.Exists(path))
        {
            return new MinitigerLanguageFlagsState();
        }

        try
        {
            var json = await System.IO.File.ReadAllTextAsync(
                path,
                Encoding.UTF8,
                cancellationToken).ConfigureAwait(false);

            var state = JsonSerializer.Deserialize<MinitigerLanguageFlagsState>(
                json,
                JsonOptions)
                ?? new MinitigerLanguageFlagsState();

            state.Items = new Dictionary<string, List<string>>(
                state.Items,
                StringComparer.OrdinalIgnoreCase);

            return state;
        }
        catch (Exception)
        {
            return new MinitigerLanguageFlagsState();
        }
    }

    private static async Task SaveStateAsync(
        MinitigerLanguageFlagsState state,
        CancellationToken cancellationToken)
    {
        var path = GetStatePath();
        var temporaryPath = path + ".tmp";
        var json = JsonSerializer.Serialize(state, JsonOptions);

        try
        {
            await System.IO.File.WriteAllTextAsync(
                temporaryPath,
                json,
                Encoding.UTF8,
                cancellationToken).ConfigureAwait(false);

            System.IO.File.Move(
                temporaryPath,
                path,
                true);
        }
        finally
        {
            if (System.IO.File.Exists(temporaryPath))
            {
                System.IO.File.Delete(temporaryPath);
            }
        }
    }
}

public sealed class MinitigerLanguageFlagsUpdateRequest
{
    public List<string>? Languages { get; set; }
}

public sealed class MinitigerLanguageFlagsBulkUpdateRequest
{
    public List<string>? ItemIds { get; set; }

    public List<string>? Languages { get; set; }
}

public sealed class MinitigerLanguageFlagsState
{
    public int Version { get; set; } = 1;

    public Dictionary<string, List<string>> Items { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
}
