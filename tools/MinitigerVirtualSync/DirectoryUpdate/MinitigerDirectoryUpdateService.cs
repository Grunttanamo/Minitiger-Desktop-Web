using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.IO;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MinitigerVirtualSync.DirectoryUpdate;

public sealed record MinitigerDirectoryUpdateResult(
    string Status,
    string Message,
    Guid RequestedItemId,
    Guid ScanItemId,
    string ScanItemName,
    string ScanPath);

public sealed record MinitigerDirectoryUpdateLibrary(
    Guid Id,
    string Name,
    string CollectionType,
    string[] Locations);

public sealed record MinitigerLibraryPrefixScanFoundItem(
    string Kind,
    string Name,
    int NewItems,
    int NewEpisodes,
    int NewBooks,
    string Summary,
    string Path);

public sealed record MinitigerLibraryPrefixScanStatus
{
    public string Status { get; init; } = "idle";

    public bool Running { get; init; }

    public bool Completed { get; init; }

    public Guid LibraryId { get; init; }

    public string LibraryName { get; init; } = string.Empty;

    public string Prefix { get; init; } = string.Empty;

    public int Total { get; init; }

    public int Processed { get; init; }

    public int NewItems { get; init; }

    public string CurrentItem { get; init; } = string.Empty;

    public string Message { get; init; } = string.Empty;

    public IReadOnlyList<MinitigerLibraryPrefixScanFoundItem> FoundItems { get; init; }
        = Array.Empty<MinitigerLibraryPrefixScanFoundItem>();

    public IReadOnlyList<string> Errors { get; init; }
        = Array.Empty<string>();
}

internal sealed record MinitigerPrefixDiscoveryResult(
    MinitigerLibraryPrefixScanFoundItem? FoundItem,
    IReadOnlyList<string> MissingPaths);

public sealed class MinitigerDirectoryUpdateService
{
    private readonly ILibraryManager _libraryManager;
    private readonly IDirectoryService _directoryService;
    private readonly ILibraryMonitor _libraryMonitor;
    private readonly ILogger<MinitigerDirectoryUpdateService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly object _prefixStatusLock = new();

    private MinitigerLibraryPrefixScanStatus _prefixStatus = new();

    public MinitigerDirectoryUpdateService(
        ILibraryManager libraryManager,
        IDirectoryService directoryService,
        ILibraryMonitor libraryMonitor,
        ILogger<MinitigerDirectoryUpdateService> logger)
    {
        _libraryManager = libraryManager;
        _directoryService = directoryService;
        _libraryMonitor = libraryMonitor;
        _logger = logger;
    }

    public IReadOnlyList<MinitigerDirectoryUpdateLibrary> GetLibraries()
        => _libraryManager
            .GetVirtualFolders()
            .Select(folder =>
            {
                if (
                    !Guid.TryParse(
                        folder.ItemId,
                        out var id)
                )
                {
                    return null;
                }

                return new MinitigerDirectoryUpdateLibrary(
                    id,
                    folder.Name ?? string.Empty,
                    folder.CollectionType?.ToString() ?? string.Empty,
                    folder.Locations
                        ?.Where(path => !string.IsNullOrWhiteSpace(path))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToArray()
                        ?? Array.Empty<string>());
            })
            .Where(folder =>
                folder is not null
                && folder.Locations.Length > 0)
            .Cast<MinitigerDirectoryUpdateLibrary>()
            .OrderBy(
                folder => folder.Name,
                StringComparer.CurrentCultureIgnoreCase)
            .ToArray();

    public MinitigerLibraryPrefixScanStatus GetPrefixScanStatus()
    {
        lock (_prefixStatusLock)
        {
            return _prefixStatus;
        }
    }

    public MinitigerLibraryPrefixScanStatus StartPrefixScan(
        Guid libraryId,
        string prefix)
    {
        string normalizedPrefix;

        try
        {
            normalizedPrefix =
                NormalizePrefix(prefix);
        }
        catch (ArgumentException ex)
        {
            return SetPrefixStatus(
                new MinitigerLibraryPrefixScanStatus
                {
                    Status = "error",
                    Completed = true,
                    LibraryId = libraryId,
                    Prefix = prefix?.Trim() ?? string.Empty,
                    Message = ex.Message,
                    Errors = new[] { ex.Message }
                });
        }

        var virtualFolder =
            FindVirtualFolder(libraryId);

        if (virtualFolder is null)
        {
            return SetPrefixStatus(
                new MinitigerLibraryPrefixScanStatus
                {
                    Status = "error",
                    Completed = true,
                    LibraryId = libraryId,
                    Prefix = normalizedPrefix,
                    Message = "Die ausgewählte Jellyfin-Bibliothek wurde nicht gefunden.",
                    Errors = new[]
                    {
                        "Die Bibliothek existiert nicht mehr oder wurde zwischenzeitlich neu angelegt."
                    }
                });
        }

        if (!_gate.Wait(0))
        {
            var current =
                GetPrefixScanStatus();

            return current with
            {
                Status = "busy",
                Message = "Ein anderes Minitiger-Verzeichnis-Update läuft bereits."
            };
        }

        var initial =
            new MinitigerLibraryPrefixScanStatus
            {
                Status = "running",
                Running = true,
                LibraryId = libraryId,
                LibraryName = virtualFolder.Name ?? string.Empty,
                Prefix = normalizedPrefix,
                Message = $"Bereite Teilscan für „{virtualFolder.Name}“ · {normalizedPrefix} vor …"
            };

        SetPrefixStatus(initial);

        _ = Task.Run(
            async () =>
            {
                try
                {
                    await RunPrefixScanAsync(
                            libraryId,
                            normalizedPrefix)
                        .ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    _logger.LogError(
                        ex,
                        "Minitiger prefix library scan failed for {LibraryId} {Prefix}.",
                        libraryId,
                        normalizedPrefix);

                    UpdatePrefixStatus(
                        current => current with
                        {
                            Status = "error",
                            Running = false,
                            Completed = true,
                            CurrentItem = string.Empty,
                            Message = $"Bibliotheks-Teilscan fehlgeschlagen: {ex.Message}",
                            Errors = AppendError(
                                current.Errors,
                                ex.Message)
                        });
                }
                finally
                {
                    _gate.Release();
                }
            });

        return initial;
    }

    public async Task<MinitigerDirectoryUpdateResult> UpdateAsync(
        Guid itemId,
        CancellationToken cancellationToken)
    {
        if (!await _gate.WaitAsync(0, cancellationToken).ConfigureAwait(false))
        {
            return Result(
                "busy",
                "Ein anderes Verzeichnis-Update läuft bereits.",
                itemId);
        }

        try
        {
            var requested =
                _libraryManager.GetItemById(itemId);

            if (requested is null)
            {
                return Result(
                    "unsupported",
                    "Die Jellyfin-ID wurde nicht gefunden.",
                    itemId);
            }

            var scanFolder =
                ResolveScanFolder(requested);

            if (scanFolder is null)
            {
                return Result(
                    "unsupported",
                    "Für diesen Inhalt konnte kein durchsuchbares Root-Verzeichnis ermittelt werden.",
                    itemId);
            }

            var scanPath =
                !string.IsNullOrWhiteSpace(scanFolder.Path)
                    ? scanFolder.Path
                    : scanFolder.ContainingFolderPath;

            if (
                string.IsNullOrWhiteSpace(scanPath)
                || !Directory.Exists(scanPath)
            )
            {
                return Result(
                    "unsupported",
                    "Das Root-Verzeichnis ist nicht vorhanden oder nicht erreichbar.",
                    itemId,
                    scanFolder);
            }

            _logger.LogInformation(
                "Minitiger directory update started for {RequestedItemId}; scanning {ScanItemId} {ScanPath}",
                itemId,
                scanFolder.Id,
                scanPath);

            _directoryService.Invalidate(scanPath);

            await scanFolder
                .ValidateChildren(
                    new Progress<double>(),
                    CreateRefreshOptions(),
                    recursive: true,
                    allowRemoveRoot: false,
                    cancellationToken: cancellationToken)
                .ConfigureAwait(false);

            _logger.LogInformation(
                "Minitiger directory update completed for {ScanItemId} {ScanPath}",
                scanFolder.Id,
                scanPath);

            return Result(
                "updated",
                "Verzeichnis-Update abgeschlossen. Neue bzw. geänderte Inhalte wurden gezielt neu eingelesen.",
                itemId,
                scanFolder);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Minitiger directory update failed for {ItemId}.",
                itemId);

            return Result(
                "error",
                $"Verzeichnis-Update fehlgeschlagen: {ex.Message}",
                itemId);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task RunPrefixScanAsync(
        Guid libraryId,
        string prefix)
    {
        var virtualFolder =
            FindVirtualFolder(libraryId)
            ?? throw new InvalidOperationException(
                "Die ausgewählte Bibliothek wurde während des Scans entfernt.");

        var libraryRoot =
            _libraryManager.GetItemById(
                libraryId)
            as Folder
            ?? throw new InvalidOperationException(
                "Der Jellyfin-Bibliotheksknoten konnte nicht geöffnet werden.");

        var collectionType =
            (libraryRoot as ICollectionFolder)
                ?.CollectionType;

        var targets =
            new List<(Folder Parent, FileSystemMetadata Entry)>();

        var enumerationErrors =
            new List<string>();

        foreach (
            var location
            in virtualFolder.Locations
                ?? Array.Empty<string>())
        {
            if (
                string.IsNullOrWhiteSpace(location)
                || !Directory.Exists(location)
            )
            {
                enumerationErrors.Add(
                    $"{location}: Verzeichnis ist nicht vorhanden oder für Jellyfin nicht erreichbar.");
                continue;
            }

            var physicalRoot =
                ResolvePhysicalRoot(
                    libraryRoot,
                    location);

            if (physicalRoot is null)
            {
                enumerationErrors.Add(
                    $"{location}: Jellyfin konnte den physischen Bibliotheks-Root nicht auflösen.");
                continue;
            }

            try
            {
                _directoryService.Invalidate(
                    location);

                foreach (
                    var entry
                    in _directoryService
                        .GetFileSystemEntries(
                            location)
                        .Where(entry =>
                            MatchesPrefix(
                                entry,
                                prefix))
                        .OrderBy(
                            entry => EntryName(entry),
                            StringComparer.CurrentCultureIgnoreCase))
                {
                    if (
                        _libraryManager.IgnoreFile(
                            entry,
                            physicalRoot)
                    )
                    {
                        continue;
                    }

                    targets.Add(
                        (
                            physicalRoot,
                            entry
                        ));
                }
            }
            catch (Exception ex)
            {
                enumerationErrors.Add(
                    $"{location}: Root-Inhalte konnten nicht gelesen werden · {ex.Message}");
            }
        }

        UpdatePrefixStatus(
            current => current with
            {
                Total = targets.Count,
                Errors = enumerationErrors.ToArray(),
                Message =
                    targets.Count > 0
                        ? $"{targets.Count} passende Root-Inhalte gefunden. Scan läuft …"
                        : $"Keine Root-Inhalte mit Anfang „{prefix}“ gefunden."
            });

        if (targets.Count == 0)
        {
            UpdatePrefixStatus(
                current => current with
                {
                    Status = enumerationErrors.Count > 0
                        ? "completed-with-errors"
                        : "completed",
                    Running = false,
                    Completed = true,
                    CurrentItem = string.Empty
                });

            return;
        }

        var discoveredPaths =
            new List<string>();

        foreach (
            var target
            in targets)
        {
            var displayName =
                EntryName(
                    target.Entry);

            UpdatePrefixStatus(
                current => current with
                {
                    CurrentItem = displayName,
                    Message = $"Prüfe „{displayName}“ …"
                });

            try
            {
                var discovery =
                    ScanPrefixTarget(
                        target.Parent,
                        target.Entry,
                        collectionType,
                        virtualFolder.CollectionType?.ToString()
                            ?? string.Empty);

                discoveredPaths.AddRange(
                    discovery.MissingPaths);

                var found =
                    discovery.FoundItem;

                UpdatePrefixStatus(
                    current =>
                    {
                        var foundItems =
                            found is null
                                ? current.FoundItems
                                : current.FoundItems
                                    .Concat(new[] { found })
                                    .ToArray();

                        return current with
                        {
                            Processed =
                                current.Processed + 1,
                            NewItems =
                                current.NewItems
                                + (found?.NewItems ?? 0),
                            FoundItems = foundItems,
                            Message =
                                $"{current.Processed + 1} / {current.Total} Root-Inhalte geprüft · "
                                + $"{current.NewItems + (found?.NewItems ?? 0)} fehlende Inhalte gefunden"
                        };
                    });
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Minitiger prefix scan failed for {Path}.",
                    target.Entry.FullName);

                UpdatePrefixStatus(
                    current => current with
                    {
                        Processed =
                            current.Processed + 1,
                        Errors = AppendError(
                            current.Errors,
                            $"{displayName}: {ex.Message}"),
                        Message =
                            $"{current.Processed + 1} / {current.Total} geprüft · "
                            + $"Fehler bei „{displayName}“"
                    });
            }
        }

        var pathsToNotify =
            discoveredPaths
                .Where(path =>
                    !string.IsNullOrWhiteSpace(path))
                .Distinct(
                    StringComparer.OrdinalIgnoreCase)
                .ToArray();

        if (pathsToNotify.Length > 0)
        {
            UpdatePrefixStatus(
                current => current with
                {
                    Message =
                        $"Read-only-Prüfung abgeschlossen · {current.Processed} Root-Inhalte geprüft · "
                        + $"{current.NewItems} fehlende Inhalte gefunden · Übergabe an Jellyfin …"
                });

            foreach (
                var missingPath
                in pathsToNotify)
            {
                try
                {
                    _logger.LogInformation(
                        "Minitiger prefix scan handing missing path to Jellyfin library monitor: {Path}",
                        missingPath);

                    /*
                     * Do not create/update Jellyfin database items ourselves.
                     * Feed the exact missing path into Jellyfin's own normal
                     * filesystem-change pipeline. FileRefresher will debounce
                     * sibling changes and refresh the nearest existing parent.
                     */
                    _libraryMonitor.ReportFileSystemChanged(
                        missingPath);
                }
                catch (Exception ex)
                {
                    _logger.LogError(
                        ex,
                        "Minitiger prefix scan could not hand {Path} to Jellyfin library monitor.",
                        missingPath);

                    UpdatePrefixStatus(
                        current => current with
                        {
                            Errors = AppendError(
                                current.Errors,
                                $"{missingPath}: Übergabe an Jellyfins Dateisystem-Watcher fehlgeschlagen · {ex.Message}")
                        });
                }
            }
        }

        UpdatePrefixStatus(
            current => current with
            {
                Status =
                    current.Errors.Count > 0
                        ? "completed-with-errors"
                        : "completed",
                Running = false,
                Completed = true,
                CurrentItem = string.Empty,
                Message =
                    pathsToNotify.Length > 0
                        ? $"Teilscan abgeschlossen · {current.Processed} Root-Inhalte geprüft · "
                            + $"{current.NewItems} fehlende Inhalte gefunden · "
                            + $"{pathsToNotify.Length} Pfad(e) an Jellyfin übergeben"
                        : $"Teilscan abgeschlossen · {current.Processed} Root-Inhalte geprüft · nichts fehlt"
            });
    }

    private MinitigerPrefixDiscoveryResult ScanPrefixTarget(
        Folder parent,
        FileSystemMetadata entry,
        CollectionType? collectionType,
        string libraryType)
    {
        /*
         * Strict read-only discovery:
         * - Resolve filesystem items in memory.
         * - Compare IDs / paths with Jellyfin's current library database.
         * - Never call CreateItems, ValidateChildren or RefreshMetadata here.
         *
         * Missing paths are handed to ILibraryMonitor only after ALL roots for
         * the requested letter have been inspected.
         */
        _directoryService.Invalidate(
            entry.FullName);

        var missing =
            new List<BaseItem>();

        var visitedDirectories =
            new HashSet<string>(
                StringComparer.OrdinalIgnoreCase);

        var existingRoot =
            _libraryManager.FindByPath(
                entry.FullName,
                entry.IsDirectory);

        if (existingRoot is null)
        {
            var resolvedRoots =
                _libraryManager
                    .ResolvePaths(
                        new[] { entry },
                        _directoryService,
                        parent,
                        _libraryManager.GetLibraryOptions(parent),
                        collectionType)
                    .ToArray();

            if (resolvedRoots.Length == 0)
            {
                throw new InvalidOperationException(
                    "Jellyfin konnte diesen Datei-/Ordnernamen keinem Medientyp zuordnen.");
            }

            missing.AddRange(
                resolvedRoots);

            /*
             * The whole root is missing. One watcher notification for that
             * root is sufficient; Jellyfin will discover its children through
             * the normal library pipeline.
             */
            return BuildDiscoveryResult(
                resolvedRoots[0],
                missing,
                libraryType);
        }

        if (existingRoot is Folder existingFolder)
        {
            DiscoverMissingChildrenReadOnly(
                existingFolder,
                collectionType,
                missing,
                visitedDirectories);
        }

        return BuildDiscoveryResult(
            existingRoot,
            missing,
            libraryType);
    }

    private void DiscoverMissingChildrenReadOnly(
        Folder parent,
        CollectionType? collectionType,
        List<BaseItem> missing,
        HashSet<string> visitedDirectories)
    {
        var directoryPath =
            !string.IsNullOrWhiteSpace(
                parent.Path)
                ? parent.Path
                : parent.ContainingFolderPath;

        if (
            string.IsNullOrWhiteSpace(
                directoryPath)
            || !Directory.Exists(
                directoryPath)
        )
        {
            return;
        }

        var normalizedPath =
            Path.GetFullPath(
                    directoryPath)
                .TrimEnd(
                    Path.DirectorySeparatorChar,
                    Path.AltDirectorySeparatorChar);

        if (
            !visitedDirectories.Add(
                normalizedPath)
        )
        {
            return;
        }

        _directoryService.Invalidate(
            directoryPath);

        FileSystemMetadata[] entries;

        try
        {
            entries =
                _directoryService
                    .GetFileSystemEntries(
                        directoryPath)
                    .ToArray();
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                $"Dateisystem-Prüfung für „{directoryPath}“ fehlgeschlagen: {ex.Message}",
                ex);
        }

        var resolved =
            _libraryManager
                .ResolvePaths(
                    entries,
                    _directoryService,
                    parent,
                    _libraryManager.GetLibraryOptions(parent),
                    collectionType)
                .ToArray();

        foreach (
            var candidate
            in resolved)
        {
            var existing =
                FindExistingResolvedItem(
                    candidate);

            if (existing is null)
            {
                missing.Add(
                    candidate);

                /*
                 * Do not descend into an unknown folder. The missing folder
                 * itself is the smallest safe notification target; Jellyfin's
                 * own watcher refresh will discover everything below it.
                 */
                continue;
            }

            if (existing is Folder childFolder)
            {
                DiscoverMissingChildrenReadOnly(
                    childFolder,
                    collectionType,
                    missing,
                    visitedDirectories);
            }
        }
    }

    private MinitigerPrefixDiscoveryResult BuildDiscoveryResult(
        BaseItem root,
        IReadOnlyList<BaseItem> missing,
        string libraryType)
    {
        if (missing.Count == 0)
        {
            return new MinitigerPrefixDiscoveryResult(
                null,
                Array.Empty<string>());
        }

        var missingPaths =
            missing
                .Select(item =>
                    item.Path)
                .Where(path =>
                    !string.IsNullOrWhiteSpace(path))
                .Cast<string>()
                .Distinct(
                    StringComparer.OrdinalIgnoreCase)
                .ToArray();

        var newEpisodes =
            missing.Count(item =>
                string.Equals(
                    item.GetType().Name,
                    "Episode",
                    StringComparison.OrdinalIgnoreCase));

        var newBooks =
            missing.Count(item =>
                string.Equals(
                    item.GetType().Name,
                    "Book",
                    StringComparison.OrdinalIgnoreCase));

        var meaningfulCount =
            MeaningfulNewItemCount(
                libraryType,
                missing,
                newEpisodes,
                newBooks);

        var foundItem =
            new MinitigerLibraryPrefixScanFoundItem(
                LibraryKind(
                    libraryType),
                root.Name
                    ?? Path.GetFileName(
                        root.Path
                            ?? string.Empty),
                meaningfulCount,
                newEpisodes,
                newBooks,
                FoundSummary(
                    libraryType,
                    root.Name
                        ?? Path.GetFileName(
                            root.Path
                                ?? string.Empty),
                    meaningfulCount,
                    newEpisodes,
                    newBooks),
                root.Path
                    ?? string.Empty);

        return new MinitigerPrefixDiscoveryResult(
            foundItem,
            missingPaths);
    }

    private BaseItem? FindExistingResolvedItem(
        BaseItem candidate)
    {
        var byId =
            _libraryManager.GetItemById(
                candidate.Id);

        if (byId is not null)
        {
            return byId;
        }

        if (
            string.IsNullOrWhiteSpace(
                candidate.Path)
        )
        {
            return null;
        }

        return _libraryManager.FindByPath(
            candidate.Path,
            candidate is Folder);
    }

    private Folder? ResolvePhysicalRoot(
        Folder libraryRoot,
        string location)
    {
        var direct =
            _libraryManager.FindByPath(
                location,
                true)
            as Folder;

        if (direct is not null)
        {
            return direct;
        }

        return libraryRoot
            .Children
            .OfType<Folder>()
            .FirstOrDefault(
                child =>
                    string.Equals(
                        child.Path,
                        location,
                        StringComparison.OrdinalIgnoreCase)
                    || string.Equals(
                        child.ContainingFolderPath,
                        location,
                        StringComparison.OrdinalIgnoreCase));
    }

    private VirtualFolderInfo? FindVirtualFolder(
        Guid libraryId)
        => _libraryManager
            .GetVirtualFolders()
            .FirstOrDefault(
                folder =>
                    Guid.TryParse(
                        folder.ItemId,
                        out var id)
                    && id == libraryId);

    private static string NormalizePrefix(
        string? value)
    {
        var normalized =
            (value ?? string.Empty)
                .Trim()
                .ToUpperInvariant();

        if (normalized == "0-9")
        {
            return normalized;
        }

        if (
            normalized.Length == 1
            && normalized[0] >= 'A'
            && normalized[0] <= 'Z'
        )
        {
            return normalized;
        }

        throw new ArgumentException(
            "Bitte einen Buchstaben von A–Z oder „0-9“ auswählen.");
    }

    private static bool MatchesPrefix(
        FileSystemMetadata entry,
        string prefix)
    {
        var name =
            EntryName(entry);

        if (string.IsNullOrWhiteSpace(name))
        {
            return false;
        }

        var first =
            name[0];

        return prefix == "0-9"
            ? char.IsDigit(first)
            : char.ToUpperInvariant(first)
                == prefix[0];
    }

    private static string EntryName(
        FileSystemMetadata entry)
    {
        var path =
            entry.FullName
                .TrimEnd(
                    Path.DirectorySeparatorChar,
                    Path.AltDirectorySeparatorChar);

        return Path.GetFileName(path);
    }

    private static int MeaningfulNewItemCount(
        string libraryType,
        IReadOnlyList<BaseItem> added,
        int newEpisodes,
        int newBooks)
    {
        if (
            string.Equals(
                libraryType,
                "tvshows",
                StringComparison.OrdinalIgnoreCase)
        )
        {
            return Math.Max(
                newEpisodes,
                1);
        }

        if (
            string.Equals(
                libraryType,
                "books",
                StringComparison.OrdinalIgnoreCase)
        )
        {
            return Math.Max(
                newBooks,
                1);
        }

        if (
            string.Equals(
                libraryType,
                "movies",
                StringComparison.OrdinalIgnoreCase)
        )
        {
            return 1;
        }

        var leafItems =
            added.Count(item =>
                item is not Folder);

        return Math.Max(
            leafItems,
            1);
    }

    private static string LibraryKind(
        string libraryType)
    {
        if (
            string.Equals(
                libraryType,
                "tvshows",
                StringComparison.OrdinalIgnoreCase)
        )
        {
            return "series";
        }

        if (
            string.Equals(
                libraryType,
                "movies",
                StringComparison.OrdinalIgnoreCase)
        )
        {
            return "movie";
        }

        if (
            string.Equals(
                libraryType,
                "books",
                StringComparison.OrdinalIgnoreCase)
        )
        {
            return "book";
        }

        return "other";
    }

    private static string FoundSummary(
        string libraryType,
        string name,
        int meaningfulCount,
        int newEpisodes,
        int newBooks)
    {
        if (
            string.Equals(
                libraryType,
                "tvshows",
                StringComparison.OrdinalIgnoreCase)
        )
        {
            return $"Serie: {name} | {newEpisodes} neue Folge{(newEpisodes == 1 ? string.Empty : "n")} | gefunden";
        }

        if (
            string.Equals(
                libraryType,
                "movies",
                StringComparison.OrdinalIgnoreCase)
        )
        {
            return $"Film: {name} gefunden";
        }

        if (
            string.Equals(
                libraryType,
                "books",
                StringComparison.OrdinalIgnoreCase)
        )
        {
            return $"Manga/Buch: {name} | {newBooks} neue{(newBooks == 1 ? "r Band" : " Bände")} gefunden";
        }

        return $"Inhalt: {name} | {meaningfulCount} neu gefunden";
    }

    private MetadataRefreshOptions CreateRefreshOptions()
        => new(
            _directoryService)
        {
            MetadataRefreshMode =
                MetadataRefreshMode.Default,
            ImageRefreshMode =
                MetadataRefreshMode.Default,
            ReplaceAllMetadata = false,
            ReplaceAllImages = false,
            RemoveOldMetadata = false,
            IsAutomated = false
        };

    private Folder? ResolveScanFolder(
        BaseItem requested)
    {
        if (requested is Folder folder)
        {
            return folder;
        }

        if (requested.ParentId != Guid.Empty)
        {
            var parent = _libraryManager
                .GetItemById(
                    requested.ParentId)
                as Folder;

            if (
                parent is not null
                && !parent.IsTopParent
            )
            {
                return parent;
            }
        }

        return null;
    }

    private MinitigerLibraryPrefixScanStatus SetPrefixStatus(
        MinitigerLibraryPrefixScanStatus status)
    {
        lock (_prefixStatusLock)
        {
            _prefixStatus =
                status;

            return _prefixStatus;
        }
    }

    private void UpdatePrefixStatus(
        Func<
            MinitigerLibraryPrefixScanStatus,
            MinitigerLibraryPrefixScanStatus
        > update)
    {
        lock (_prefixStatusLock)
        {
            _prefixStatus =
                update(
                    _prefixStatus);
        }
    }

    private static IReadOnlyList<string> AppendError(
        IReadOnlyList<string> errors,
        string error)
        => errors
            .Concat(
                new[] { error })
            .TakeLast(50)
            .ToArray();

    private static MinitigerDirectoryUpdateResult Result(
        string status,
        string message,
        Guid requestedItemId,
        Folder? scanFolder = null)
        => new(
            status,
            message,
            requestedItemId,
            scanFolder?.Id ?? Guid.Empty,
            scanFolder?.Name ?? string.Empty,
            scanFolder?.Path
                ?? scanFolder?.ContainingFolderPath
                ?? string.Empty);
}
