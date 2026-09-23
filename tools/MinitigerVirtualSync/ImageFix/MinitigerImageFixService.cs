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
    bool Banners)
{
    public bool Any =>
        Posters
        || Backdrops
        || SeasonPosters
        || Landscape
        || Banners;
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
    int BannerCandidates);

public sealed record MinitigerImageFixStatus(
    bool Running,
    bool Completed,
    bool Cancelled,
    int Total,
    int Processed,
    int Converted,
    int Failed,
    int Skipped,
    string CurrentItem,
    string CurrentCategory,
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
    long SourceBytes);

public sealed class MinitigerImageFixService
{
    private readonly object _gate = new();
    private readonly ILibraryManager _libraryManager;
    private readonly IImageEncoder _imageEncoder;
    private readonly ILogger<MinitigerImageFixService> _logger;

    private List<MinitigerImageFixCandidate> _candidates = [];
    private CancellationTokenSource? _runCancellation;
    private bool _running;
    private bool _completed;
    private bool _cancelled;
    private int _processed;
    private int _converted;
    private int _failed;
    private int _skipped;
    private string _currentItem = string.Empty;
    private string _currentCategory = string.Empty;
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
        }

        var items = _libraryManager.GetItemList(
            new InternalItemsQuery
            {
                Recursive = true,
                IsVirtualItem = false,
                GroupByPresentationUniqueKey = false,
                EnableTotalRecordCount = false
            });

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
                        sourceBytes));

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
            bannerCandidates);
    }

    public MinitigerImageFixStatus Start()
    {
        List<MinitigerImageFixCandidate> snapshot;

        lock (_gate)
        {
            if (_running)
            {
                return GetStatusUnsafe();
            }

            if (_candidates.Count == 0)
            {
                throw new InvalidOperationException(
                    "Es gibt keine gescannten WebP-Kandidaten.");
            }

            ResetRunState();
            _running = true;
            _runCancellation =
                new CancellationTokenSource();

            snapshot = [.. _candidates];

            _ = Task.Run(
                () => RunAsync(
                    snapshot,
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
        CancellationToken cancellationToken)
    {
        try
        {
            foreach (var candidate in candidates)
            {
                cancellationToken
                    .ThrowIfCancellationRequested();

                lock (_gate)
                {
                    _currentItem =
                        candidate.ItemName;
                    _currentCategory =
                        candidate.Category;
                }

                try
                {
                    var result =
                        await ConvertCandidateAsync(
                            candidate,
                            cancellationToken)
                        .ConfigureAwait(false);

                    lock (_gate)
                    {
                        _processed++;
                        _sourceBytes +=
                            candidate.SourceBytes;

                        if (result.Converted)
                        {
                            _converted++;
                            _outputBytes +=
                                result.OutputBytes;
                        }
                        else
                        {
                            _skipped++;
                        }
                    }
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
                        _sourceBytes +=
                            candidate.SourceBytes;

                        if (_errors.Count < 30)
                        {
                            _errors.Add(
                                $"{candidate.ItemName} · {candidate.Category}: {ex.Message}");
                        }
                    }
                }
            }

            lock (_gate)
            {
                _completed = true;
            }
        }
        catch (OperationCanceledException)
        {
            lock (_gate)
            {
                _cancelled = true;
            }
        }
        finally
        {
            lock (_gate)
            {
                _running = false;
                _currentItem = string.Empty;
                _currentCategory = string.Empty;
                _runCancellation?.Dispose();
                _runCancellation = null;
            }
        }
    }

    private async Task<(bool Converted, long OutputBytes)>
        ConvertCandidateAsync(
            MinitigerImageFixCandidate candidate,
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

        if (!File.Exists(candidate.SourcePath))
        {
            return (false, 0);
        }

        var item =
            _libraryManager.GetItemById(
                candidate.ItemId);

        if (item is null)
        {
            return (false, 0);
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
            return (false, 0);
        }

        var targetPath =
            Path.ChangeExtension(
                candidate.SourcePath,
                ".webp");

        if (File.Exists(targetPath))
        {
            return (false, 0);
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

            var encodedPath =
                _imageEncoder.EncodeImage(
                    candidate.SourcePath,
                    File.GetLastWriteTimeUtc(
                        candidate.SourcePath),
                    tempPath,
                    true,
                    null,
                    quality,
                    options,
                    ImageFormat.Webp);

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

            await item
                .UpdateToRepositoryAsync(
                    ItemUpdateType.ImageUpdate,
                    cancellationToken)
                .ConfigureAwait(false);

            return (
                true,
                new FileInfo(
                    targetPath).Length);
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
            if (File.Exists(tempPath))
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

    private static string? ResolveCategory(
        BaseItem item,
        ImageType imageType,
        MinitigerImageFixSelection selection)
    {
        if (
            imageType == ImageType.Primary
            && item is Season
        )
        {
            return selection.SeasonPosters
                ? "Staffelposter"
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
        _processed = 0;
        _converted = 0;
        _failed = 0;
        _skipped = 0;
        _currentItem = string.Empty;
        _currentCategory = string.Empty;
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
            _candidates.Count,
            _processed,
            _converted,
            _failed,
            _skipped,
            _currentItem,
            _currentCategory,
            _sourceBytes,
            _outputBytes,
            _sourceBytes - _outputBytes,
            _errors.ToArray());
    }
}
