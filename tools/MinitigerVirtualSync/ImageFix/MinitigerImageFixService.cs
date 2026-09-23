using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Enums;
using MediaBrowser.Controller.Drawing;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Drawing;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MinitigerVirtualSync.ImageFix;

public sealed record MinitigerImageFixSelection(
    bool Posters,
    bool Backdrops,
    bool SeasonPosters,
    bool Landscape,
    bool Banners,
    bool People)
{
    public bool Any =>
        Posters
        || Backdrops
        || SeasonPosters
        || Landscape
        || Banners
        || People;
}

public sealed record MinitigerImageFixScanResult(
    int ScannedItems,
    int SelectedImages,
    int AlreadyWebp,
    int Jpg,
    int Png,
    int OtherFormats,
    int RemoteSkipped,
    int MissingSkipped,
    int TargetExistsSkipped,
    int Convertible,
    long ConvertibleBytes,
    int PosterCandidates,
    int BackdropCandidates,
    int SeasonPosterCandidates,
    int LandscapeCandidates,
    int BannerCandidates,
    int PeopleCandidates);

public sealed record MinitigerImageFixStatus(
    bool Running,
    bool Completed,
    bool Cancelled,
    bool CancelRequested,
    bool NeedsServerRestart,
    bool TimedOut,
    bool DeleteOriginals,
    int Total,
    int Processed,
    int Converted,
    int DeletedOriginals,
    int ProtectedOriginals,
    int DeleteFailures,
    int Failed,
    int Skipped,
    string CurrentItem,
    string CurrentCategory,
    string CurrentStep,
    string CurrentPath,
    DateTimeOffset? CurrentStartedAtUtc,
    DateTimeOffset LastProgressAtUtc,
    int BackgroundEncodes,
    long SourceBytes,
    long OutputBytes,
    long SavedBytes,
    IReadOnlyList<string> Errors);

internal sealed record MinitigerImageFixCandidate(
    Guid ItemId,
    string ItemName,
    ImageType ImageType,
    int ImageIndex,
    string Category,
    string SourcePath,
    long SourceBytes,
    bool SharedSource);

internal sealed record MinitigerImageFixConversionResult(
    bool Converted,
    long OutputBytes,
    bool OriginalDeleted,
    bool OriginalProtected,
    string? DeleteError);

internal sealed class MinitigerImageFixEncodingTimeoutException
    : TimeoutException
{
    public MinitigerImageFixEncodingTimeoutException(
        string message)
        : base(message)
    {
    }
}

public sealed class MinitigerImageFixService
{
    private static readonly TimeSpan EncodeTimeout =
        TimeSpan.FromMinutes(2);
    private static readonly TimeSpan BetweenItemsDelay =
        TimeSpan.FromMilliseconds(75);

    private readonly object _gate = new();
    private readonly ILibraryManager _libraryManager;
    private readonly IImageEncoder _imageEncoder;
    private readonly ILogger<MinitigerImageFixService> _logger;

    private List<MinitigerImageFixCandidate> _candidates = [];
    private CancellationTokenSource? _runCancellation;
    private bool _running;
    private bool _completed;
    private bool _cancelled;
    private bool _cancelRequested;
    private bool _needsServerRestart;
    private bool _timedOut;
    private bool _deleteOriginals;
    private int _processed;
    private int _converted;
    private int _deletedOriginals;
    private int _protectedOriginals;
    private int _deleteFailures;
    private int _failed;
    private int _skipped;
    private string _currentItem = string.Empty;
    private string _currentCategory = string.Empty;
    private string _currentStep = string.Empty;
    private string _currentPath = string.Empty;
    private DateTimeOffset? _currentStartedAtUtc;
    private DateTimeOffset _lastProgressAtUtc =
        DateTimeOffset.UtcNow;
    private int _backgroundEncodes;
    private long _sourceBytes;
    private long _outputBytes;
    private readonly List<string> _errors = [];

    public MinitigerImageFixService(
        ILibraryManager libraryManager,
        IImageEncoder imageEncoder,
        ILogger<MinitigerImageFixService> logger)
    {
        _libraryManager = libraryManager;
        _imageEncoder = imageEncoder;
        _logger = logger;
    }

    public MinitigerImageFixScanResult Scan(
        MinitigerImageFixSelection selection)
    {
        if (!selection.Any)
        {
            throw new ArgumentException(
                "Mindestens ein Bildtyp muss ausgewählt sein.",
                nameof(selection));
        }

        lock (_gate)
        {
            if (_running)
            {
                throw new InvalidOperationException(
                    "Während einer laufenden Konvertierung kann nicht neu gescannt werden.");
            }

            if (
                _needsServerRestart
                || _backgroundEncodes > 0
            )
            {
                throw new InvalidOperationException(
                    "Ein Bild-Encoder hängt noch im Hintergrund. Bitte Jellyfin einmal neu starten, bevor erneut gescannt oder konvertiert wird.");
            }
        }

        var items = GetScanItems(selection);

        var candidates =
            new List<MinitigerImageFixCandidate>();

        var scannedItems = 0;
        var selectedImages = 0;
        var alreadyWebp = 0;
        var jpg = 0;
        var png = 0;
        var otherFormats = 0;
        var remoteSkipped = 0;
        var missingSkipped = 0;
        var targetExistsSkipped = 0;
        long convertibleBytes = 0;
        var posterCandidates = 0;
        var backdropCandidates = 0;
        var seasonPosterCandidates = 0;
        var landscapeCandidates = 0;
        var bannerCandidates = 0;
        var peopleCandidates = 0;

        foreach (var item in items)
        {
            scannedItems++;

            var indices =
                new Dictionary<ImageType, int>();

            foreach (var image in item.ImageInfos)
            {
                var imageIndex =
                    indices.TryGetValue(
                        image.Type,
                        out var currentIndex)
                        ? currentIndex
                        : 0;

                indices[image.Type] =
                    imageIndex + 1;

                var category =
                    ResolveCategory(
                        item,
                        image.Type,
                        selection);

                if (category is null)
                {
                    continue;
                }

                selectedImages++;

                if (
                    !image.IsLocalFile
                    || string.IsNullOrWhiteSpace(
                        image.Path)
                )
                {
                    remoteSkipped++;
                    continue;
                }

                var sourcePath =
                    image.Path;

                if (!File.Exists(sourcePath))
                {
                    missingSkipped++;
                    continue;
                }

                var extension =
                    Path.GetExtension(sourcePath)
                        .ToLowerInvariant();

                if (extension == ".webp")
                {
                    alreadyWebp++;
                    continue;
                }

                var supported =
                    extension == ".jpg"
                    || extension == ".jpeg"
                    || extension == ".png";

                if (extension is ".jpg" or ".jpeg")
                {
                    jpg++;
                }
                else if (extension == ".png")
                {
                    png++;
                }
                else
                {
                    otherFormats++;
                }

                if (!supported)
                {
                    continue;
                }

                var targetPath =
                    Path.ChangeExtension(
                        sourcePath,
                        ".webp");

                if (File.Exists(targetPath))
                {
                    targetExistsSkipped++;
                    continue;
                }

                var sourceBytes =
                    new FileInfo(sourcePath).Length;

                candidates.Add(
                    new MinitigerImageFixCandidate(
                        item.Id,
                        item.Name
                            ?? item.OriginalTitle
                            ?? item.Id.ToString(),
                        image.Type,
                        imageIndex,
                        category,
                        sourcePath,
                        sourceBytes,
                        false));

                convertibleBytes += sourceBytes;

                switch (category)
                {
                    case "Poster":
                        posterCandidates++;
                        break;
                    case "Backdrop":
                        backdropCandidates++;
                        break;
                    case "Staffelposter":
                        seasonPosterCandidates++;
                        break;
                    case "Landscape":
                        landscapeCandidates++;
                        break;
                    case "Banner":
                        bannerCandidates++;
                        break;
                    case "Cast / Personen":
                        peopleCandidates++;
                        break;
                }
            }
        }

        lock (_gate)
        {
            _candidates = candidates;
            ResetRunState();
        }

        return new MinitigerImageFixScanResult(
            scannedItems,
            selectedImages,
            alreadyWebp,
            jpg,
            png,
            otherFormats,
            remoteSkipped,
            missingSkipped,
            targetExistsSkipped,
            candidates.Count,
            convertibleBytes,
            posterCandidates,
            backdropCandidates,
            seasonPosterCandidates,
            landscapeCandidates,
            bannerCandidates,
            peopleCandidates);
    }

    public MinitigerImageFixStatus Start(
        bool deleteOriginals)
    {
        List<MinitigerImageFixCandidate> snapshot;

        lock (_gate)
        {
            if (_running)
            {
                return GetStatusUnsafe();
            }

            if (
                _needsServerRestart
                || _backgroundEncodes > 0
            )
            {
                throw new InvalidOperationException(
                    "Ein Bild-Encoder hängt noch im Hintergrund. Bitte Jellyfin einmal neu starten, bevor eine neue Konvertierung gestartet wird.");
            }

            if (_candidates.Count == 0)
            {
                throw new InvalidOperationException(
                    "Es gibt keine gescannten WebP-Kandidaten.");
            }

            ResetRunState();
            _deleteOriginals =
                deleteOriginals;
            _running = true;
            _runCancellation =
                new CancellationTokenSource();

            snapshot = [.. _candidates];

            _ = Task.Run(
                () => RunAsync(
                    snapshot,
                    deleteOriginals,
                    _runCancellation.Token));
        }

        return GetStatus();
    }

    public void Cancel()
    {
        lock (_gate)
        {
            if (!_running)
            {
                return;
            }

            _cancelRequested = true;
            _currentStep =
                "Abbruch angefordert";
            _lastProgressAtUtc =
                DateTimeOffset.UtcNow;
            _runCancellation?.Cancel();
        }
    }

    public MinitigerImageFixStatus GetStatus()
    {
        lock (_gate)
        {
            return GetStatusUnsafe();
        }
    }

    private async Task RunAsync(
        IReadOnlyList<MinitigerImageFixCandidate> candidates,
        bool deleteOriginals,
        CancellationToken cancellationToken)
    {
        try
        {
            var runCandidates = deleteOriginals
                ? MarkSharedSources(candidates)
                : candidates;

            foreach (var candidate in runCandidates)
            {
                cancellationToken
                    .ThrowIfCancellationRequested();

                lock (_gate)
                {
                    _currentItem =
                        candidate.ItemName;
                    _currentCategory =
                        candidate.Category;
                    _currentPath =
                        candidate.SourcePath;
                    _currentStep =
                        "Vorbereitung";
                    _currentStartedAtUtc =
                        DateTimeOffset.UtcNow;
                    _lastProgressAtUtc =
                        DateTimeOffset.UtcNow;
                }

                try
                {
                    var result =
                        await ConvertCandidateAsync(
                            candidate,
                            deleteOriginals,
                            cancellationToken)
                        .ConfigureAwait(false);

                    lock (_gate)
                    {
                        _processed++;
                        _lastProgressAtUtc =
                            DateTimeOffset.UtcNow;

                        if (result.Converted)
                        {
                            _converted++;
                            _sourceBytes +=
                                candidate.SourceBytes;
                            _outputBytes +=
                                result.OutputBytes;

                            if (result.OriginalDeleted)
                            {
                                _deletedOriginals++;
                            }

                            if (result.OriginalProtected)
                            {
                                _protectedOriginals++;
                            }

                            if (!string.IsNullOrWhiteSpace(
                                result.DeleteError))
                            {
                                _deleteFailures++;

                                if (_errors.Count < 30)
                                {
                                    _errors.Add(
                                        $"{candidate.ItemName} · {candidate.Category}: {result.DeleteError}");
                                }
                            }
                        }
                        else
                        {
                            _skipped++;
                        }
                    }
                }
                catch (
                    MinitigerImageFixEncodingTimeoutException ex)
                {
                    _logger.LogError(
                        ex,
                        "Minitiger Image Fix encoder timeout for {ItemName} / {ImageType} / {SourcePath}.",
                        candidate.ItemName,
                        candidate.ImageType,
                        candidate.SourcePath);

                    lock (_gate)
                    {
                        _processed++;
                        _failed++;
                        _timedOut = true;
                        _needsServerRestart = true;
                        _cancelled = true;
                        _currentStep =
                            "Encoder-Timeout · Jellyfin-Neustart erforderlich";
                        _lastProgressAtUtc =
                            DateTimeOffset.UtcNow;

                        if (_errors.Count < 30)
                        {
                            _errors.Add(
                                $"{candidate.ItemName} · {candidate.Category}: {ex.Message}");
                        }
                    }

                    return;
                }
                catch (
                    OperationCanceledException)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(
                        ex,
                        "Minitiger Image Fix failed for {ItemName} / {ImageType} / {SourcePath}.",
                        candidate.ItemName,
                        candidate.ImageType,
                        candidate.SourcePath);

                    lock (_gate)
                    {
                        _processed++;
                        _failed++;
                        _lastProgressAtUtc =
                            DateTimeOffset.UtcNow;

                        if (_errors.Count < 30)
                        {
                            _errors.Add(
                                $"{candidate.ItemName} · {candidate.Category}: {ex.Message}");
                        }
                    }
                }

                lock (_gate)
                {
                    _lastProgressAtUtc =
                        DateTimeOffset.UtcNow;
                }

                await Task.Delay(
                    BetweenItemsDelay,
                    cancellationToken)
                    .ConfigureAwait(false);
            }

            lock (_gate)
            {
                if (
                    !_cancelRequested
                    && !_timedOut
                )
                {
                    _completed = true;
                }
            }
        }
        catch (OperationCanceledException)
        {
            lock (_gate)
            {
                _cancelled = true;
                _currentStep =
                    _needsServerRestart
                        ? "Abgebrochen · Jellyfin-Neustart erforderlich"
                        : "Abgebrochen";
                _lastProgressAtUtc =
                    DateTimeOffset.UtcNow;
            }
        }
        finally
        {
            lock (_gate)
            {
                _running = false;

                if (
                    !_needsServerRestart
                    && !_timedOut
                )
                {
                    _currentStep =
                        _cancelled
                            ? "Abgebrochen"
                            : "Fertig";
                }

                _lastProgressAtUtc =
                    DateTimeOffset.UtcNow;
                _runCancellation?.Dispose();
                _runCancellation = null;
            }
        }
    }

    private async Task<MinitigerImageFixConversionResult>
        ConvertCandidateAsync(
            MinitigerImageFixCandidate candidate,
            bool deleteOriginals,
            CancellationToken cancellationToken)
    {
        if (
            !_imageEncoder.SupportsImageEncoding
            || !_imageEncoder.SupportedOutputFormats
                .Contains(ImageFormat.Webp)
        )
        {
            throw new InvalidOperationException(
                "Jellyfins aktiver Bild-Encoder unterstützt keine WebP-Ausgabe.");
        }

        SetCurrentStep(
            "Quelldatei prüfen");

        if (!File.Exists(candidate.SourcePath))
        {
            return new MinitigerImageFixConversionResult(
                false,
                0,
                false,
                false,
                null);
        }

        var sourceInfo =
            new FileInfo(
                candidate.SourcePath);

        if (sourceInfo.Length <= 0)
        {
            throw new InvalidDataException(
                "Die Quelldatei ist leer.");
        }

        using (
            var sourceStream =
                new FileStream(
                    candidate.SourcePath,
                    FileMode.Open,
                    FileAccess.Read,
                    FileShare.ReadWrite | FileShare.Delete))
        {
            var header =
                new byte[16];

            if (
                sourceStream.Read(
                    header,
                    0,
                    header.Length)
                <= 0
            )
            {
                throw new InvalidDataException(
                    "Die Quelldatei konnte nicht gelesen werden.");
            }
        }

        SetCurrentStep(
            "Jellyfin-Bildreferenz prüfen");

        var item =
            _libraryManager.GetItemById(
                candidate.ItemId);

        if (item is null)
        {
            return new MinitigerImageFixConversionResult(
                false,
                0,
                false,
                false,
                null);
        }

        var currentImage =
            item.GetImageInfo(
                candidate.ImageType,
                candidate.ImageIndex);

        if (
            currentImage is null
            || !string.Equals(
                currentImage.Path,
                candidate.SourcePath,
                StringComparison.OrdinalIgnoreCase)
        )
        {
            return new MinitigerImageFixConversionResult(
                false,
                0,
                false,
                false,
                null);
        }

        var targetPath =
            Path.ChangeExtension(
                candidate.SourcePath,
                ".webp");

        if (File.Exists(targetPath))
        {
            return new MinitigerImageFixConversionResult(
                false,
                0,
                false,
                false,
                null);
        }

        var directory =
            Path.GetDirectoryName(
                candidate.SourcePath)
            ?? throw new InvalidOperationException(
                "Quellordner konnte nicht ermittelt werden.");

        var tempPath =
            Path.Combine(
                directory,
                $".{Path.GetFileNameWithoutExtension(candidate.SourcePath)}.minitiger-{Guid.NewGuid():N}.webp");

        var extension =
            Path.GetExtension(
                candidate.SourcePath)
            .ToLowerInvariant();

        var quality =
            extension == ".png"
                ? 100
                : 95;

        var oldPath =
            currentImage.Path;
        var oldDateModified =
            currentImage.DateModified;
        var oldWidth =
            currentImage.Width;
        var oldHeight =
            currentImage.Height;
        var oldBlurHash =
            currentImage.BlurHash;

        var targetCreated = false;
        var cleanupDeferred = false;

        try
        {
            var options =
                new ImageProcessingOptions
                {
                    ItemId = item.Id,
                    Item = item,
                    Image = currentImage,
                    ImageIndex =
                        candidate.ImageIndex,
                    Quality = quality,
                    SupportedOutputFormats =
                        new[]
                        {
                            ImageFormat.Webp
                        },
                    RequiresAutoOrientation = true
                };

            SetCurrentStep(
                "WebP kodieren");

            var encodeTask =
                Task.Run(
                    () =>
                        _imageEncoder.EncodeImage(
                            candidate.SourcePath,
                            File.GetLastWriteTimeUtc(
                                candidate.SourcePath),
                            tempPath,
                            true,
                            null,
                            quality,
                            options,
                            ImageFormat.Webp),
                    CancellationToken.None);

            RegisterEncodeStarted();

            string encodedPath;

            try
            {
                encodedPath =
                    await encodeTask
                        .WaitAsync(
                            EncodeTimeout,
                            cancellationToken)
                        .ConfigureAwait(false);

                RegisterEncodeFinished();
            }
            catch (TimeoutException)
            {
                cleanupDeferred = true;

                RegisterBackgroundEncode(
                    encodeTask,
                    tempPath,
                    timedOut: true);

                throw new MinitigerImageFixEncodingTimeoutException(
                    $"Die WebP-Kodierung hat nach {EncodeTimeout.TotalSeconds:0} Sekunden nicht reagiert. Problemdatei: {candidate.SourcePath}");
            }
            catch (OperationCanceledException)
            {
                if (!encodeTask.IsCompleted)
                {
                    cleanupDeferred = true;

                    RegisterBackgroundEncode(
                        encodeTask,
                        tempPath,
                        timedOut: false);
                }
                else
                {
                    RegisterEncodeFinished();
                }

                throw;
            }
            catch
            {
                RegisterEncodeFinished();
                throw;
            }

            if (
                !string.Equals(
                    encodedPath,
                    tempPath,
                    StringComparison.OrdinalIgnoreCase)
                || !File.Exists(tempPath)
                || new FileInfo(tempPath).Length <= 0
            )
            {
                throw new InvalidDataException(
                    "WebP-Ausgabe wurde nicht korrekt erzeugt.");
            }

            SetCurrentStep(
                "WebP validieren");

            var dimensions =
                _imageEncoder.GetImageSize(
                    tempPath);

            if (
                dimensions.Width <= 0
                || dimensions.Height <= 0
            )
            {
                throw new InvalidDataException(
                    "Das erzeugte WebP konnte nicht validiert werden.");
            }

            cancellationToken
                .ThrowIfCancellationRequested();

            SetCurrentStep(
                "WebP übernehmen");

            File.Move(
                tempPath,
                targetPath);

            targetCreated = true;

            item.SetImage(
                new ItemImageInfo
                {
                    Path = targetPath,
                    Type =
                        candidate.ImageType,
                    DateModified =
                        File.GetLastWriteTimeUtc(
                            targetPath),
                    Width =
                        dimensions.Width,
                    Height =
                        dimensions.Height,
                    BlurHash =
                        oldBlurHash
                },
                candidate.ImageIndex);

            SetCurrentStep(
                "Jellyfin aktualisieren");

            await item
                .UpdateToRepositoryAsync(
                    ItemUpdateType.ImageUpdate,
                    cancellationToken)
                .ConfigureAwait(false);

            var outputBytes =
                new FileInfo(
                    targetPath).Length;

            var originalDeleted = false;
            var originalProtected = false;
            string? deleteError = null;

            if (
                deleteOriginals
                && candidate.SharedSource
            )
            {
                originalProtected = true;
            }
            else if (deleteOriginals)
            {
                SetCurrentStep(
                    "Originaldatei löschen");

                try
                {
                    var persistedImage =
                        item.GetImageInfo(
                            candidate.ImageType,
                            candidate.ImageIndex);

                    if (
                        persistedImage is null
                        || !string.Equals(
                            persistedImage.Path,
                            targetPath,
                            StringComparison.OrdinalIgnoreCase)
                    )
                    {
                        throw new InvalidOperationException(
                            "Jellyfin verweist nach dem Update nicht auf die neue WebP-Datei.");
                    }

                    if (File.Exists(
                        candidate.SourcePath))
                    {
                        File.Delete(
                            candidate.SourcePath);
                    }

                    originalDeleted =
                        !File.Exists(
                            candidate.SourcePath);

                    if (!originalDeleted)
                    {
                        throw new IOException(
                            "Die Originaldatei konnte nicht gelöscht werden.");
                    }
                }
                catch (Exception ex)
                {
                    deleteError =
                        $"WebP ist aktiv, Original konnte aber nicht gelöscht werden: {ex.Message}";

                    _logger.LogWarning(
                        ex,
                        "Minitiger Image Fix could not delete original {SourcePath} after successful conversion.",
                        candidate.SourcePath);
                }
            }

            return new MinitigerImageFixConversionResult(
                true,
                outputBytes,
                originalDeleted,
                originalProtected,
                deleteError);
        }
        catch
        {
            if (targetCreated)
            {
                try
                {
                    item.SetImage(
                        new ItemImageInfo
                        {
                            Path = oldPath,
                            Type =
                                candidate.ImageType,
                            DateModified =
                                oldDateModified,
                            Width =
                                oldWidth,
                            Height =
                                oldHeight,
                            BlurHash =
                                oldBlurHash
                        },
                        candidate.ImageIndex);
                }
                catch
                {
                    // Best-effort in-memory rollback only.
                }

                try
                {
                    File.Delete(
                        targetPath);
                }
                catch
                {
                    // Keep the orphaned WebP if cleanup fails.
                }
            }

            throw;
        }
        finally
        {
            if (
                !cleanupDeferred
                && File.Exists(tempPath)
            )
            {
                try
                {
                    File.Delete(tempPath);
                }
                catch
                {
                    // Temporary cleanup is best effort.
                }
            }
        }
    }

    private void SetCurrentStep(
        string step)
    {
        lock (_gate)
        {
            _currentStep = step;
            _lastProgressAtUtc =
                DateTimeOffset.UtcNow;
        }
    }

    private void RegisterEncodeStarted()
    {
        lock (_gate)
        {
            _backgroundEncodes++;
            _lastProgressAtUtc =
                DateTimeOffset.UtcNow;
        }
    }

    private void RegisterEncodeFinished()
    {
        lock (_gate)
        {
            if (_backgroundEncodes > 0)
            {
                _backgroundEncodes--;
            }

            if (
                _backgroundEncodes == 0
                && !_timedOut
            )
            {
                _needsServerRestart = false;
            }

            _lastProgressAtUtc =
                DateTimeOffset.UtcNow;
        }
    }

    private void RegisterBackgroundEncode(
        Task<string> encodeTask,
        string tempPath,
        bool timedOut)
    {
        lock (_gate)
        {
            _needsServerRestart = true;

            if (timedOut)
            {
                _timedOut = true;
            }

            _lastProgressAtUtc =
                DateTimeOffset.UtcNow;
        }

        _ = encodeTask.ContinueWith(
            _ =>
            {
                try
                {
                    if (File.Exists(tempPath))
                    {
                        File.Delete(tempPath);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(
                        ex,
                        "Minitiger Image Fix could not clean abandoned temp file {TempPath}.",
                        tempPath);
                }
                finally
                {
                    RegisterEncodeFinished();
                }
            },
            CancellationToken.None,
            TaskContinuationOptions.ExecuteSynchronously,
            TaskScheduler.Default);
    }

    private IReadOnlyList<BaseItem> GetScanItems(
        MinitigerImageFixSelection selection)
    {
        var query = new InternalItemsQuery
        {
            Recursive = true,
            IsVirtualItem = false,
            GroupByPresentationUniqueKey = false,
            EnableTotalRecordCount = false
        };

        var imageTypes =
            new HashSet<ImageType>();

        if (
            selection.Posters
            || selection.SeasonPosters
            || selection.People
        )
        {
            imageTypes.Add(
                ImageType.Primary);
        }

        if (selection.Backdrops)
        {
            imageTypes.Add(
                ImageType.Backdrop);
        }

        if (selection.Landscape)
        {
            imageTypes.Add(
                ImageType.Primary);
            imageTypes.Add(
                ImageType.Thumb);
        }

        if (selection.Banners)
        {
            imageTypes.Add(
                ImageType.Banner);
        }

        query.ImageTypes =
            [.. imageTypes];

        var needsBroadItemScan =
            selection.Posters
            || selection.Backdrops
            || selection.Landscape
            || selection.Banners;

        if (!needsBroadItemScan)
        {
            var includeTypes =
                new List<BaseItemKind>();

            if (selection.SeasonPosters)
            {
                includeTypes.Add(
                    BaseItemKind.Season);
            }

            if (selection.People)
            {
                includeTypes.Add(
                    BaseItemKind.Person);
            }

            if (includeTypes.Count > 0)
            {
                query.IncludeItemTypes =
                    [.. includeTypes];
            }
        }

        return _libraryManager.GetItemList(query);
    }

    private IReadOnlyList<MinitigerImageFixCandidate>
        MarkSharedSources(
            IReadOnlyList<MinitigerImageFixCandidate> candidates)
    {
        if (candidates.Count == 0)
        {
            return candidates;
        }

        var candidatePaths =
            candidates
                .Select(candidate =>
                    candidate.SourcePath)
                .ToHashSet(
                    StringComparer.OrdinalIgnoreCase);

        var referenceCounts =
            candidatePaths.ToDictionary(
                path => path,
                _ => 0,
                StringComparer.OrdinalIgnoreCase);

        var items = _libraryManager.GetItemList(
            new InternalItemsQuery
            {
                Recursive = true,
                IsVirtualItem = false,
                GroupByPresentationUniqueKey = false,
                EnableTotalRecordCount = false
            });

        foreach (var item in items)
        {
            foreach (var image in item.ImageInfos)
            {
                if (
                    !image.IsLocalFile
                    || string.IsNullOrWhiteSpace(
                        image.Path)
                    || !referenceCounts.ContainsKey(
                        image.Path)
                )
                {
                    continue;
                }

                referenceCounts[image.Path]++;
            }
        }

        return candidates
            .Select(candidate =>
                candidate with
                {
                    SharedSource =
                        referenceCounts.TryGetValue(
                            candidate.SourcePath,
                            out var references)
                        && references > 1
                })
            .ToList();
    }

    private static string? ResolveCategory(
        BaseItem item,
        ImageType imageType,
        MinitigerImageFixSelection selection)
    {
        if (
            imageType == ImageType.Primary
            && item is Person
        )
        {
            return selection.People
                ? "Cast / Personen"
                : null;
        }

        if (
            imageType == ImageType.Primary
            && item is Season
        )
        {
            return selection.SeasonPosters
                ? "Staffelposter"
                : null;
        }

        if (
            imageType == ImageType.Primary
            && item is Episode
        )
        {
            return selection.Landscape
                ? "Landscape"
                : null;
        }

        if (imageType == ImageType.Primary)
        {
            return selection.Posters
                ? "Poster"
                : null;
        }

        if (imageType == ImageType.Backdrop)
        {
            return selection.Backdrops
                ? "Backdrop"
                : null;
        }

        if (imageType == ImageType.Thumb)
        {
            return selection.Landscape
                ? "Landscape"
                : null;
        }

        if (imageType == ImageType.Banner)
        {
            return selection.Banners
                ? "Banner"
                : null;
        }

        return null;
    }

    private void ResetRunState()
    {
        _completed = false;
        _cancelled = false;
        _cancelRequested = false;
        _timedOut = false;
        _deleteOriginals = false;
        _processed = 0;
        _converted = 0;
        _deletedOriginals = 0;
        _protectedOriginals = 0;
        _deleteFailures = 0;
        _failed = 0;
        _skipped = 0;
        _currentItem = string.Empty;
        _currentCategory = string.Empty;
        _currentStep = string.Empty;
        _currentPath = string.Empty;
        _currentStartedAtUtc = null;
        _lastProgressAtUtc =
            DateTimeOffset.UtcNow;
        _sourceBytes = 0;
        _outputBytes = 0;
        _errors.Clear();
    }

    private MinitigerImageFixStatus GetStatusUnsafe()
    {
        return new MinitigerImageFixStatus(
            _running,
            _completed,
            _cancelled,
            _cancelRequested,
            _needsServerRestart,
            _timedOut,
            _deleteOriginals,
            _candidates.Count,
            _processed,
            _converted,
            _deletedOriginals,
            _protectedOriginals,
            _deleteFailures,
            _failed,
            _skipped,
            _currentItem,
            _currentCategory,
            _currentStep,
            _currentPath,
            _currentStartedAtUtc,
            _lastProgressAtUtc,
            _backgroundEncodes,
            _sourceBytes,
            _outputBytes,
            _sourceBytes - _outputBytes,
            _errors.ToArray());
    }
}
