using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Providers;
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

public sealed class MinitigerDirectoryUpdateService
{
    private readonly ILibraryManager _libraryManager;
    private readonly IDirectoryService _directoryService;
    private readonly ILogger<MinitigerDirectoryUpdateService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly object _prefixStatusLock = new();

    private MinitigerLibraryPrefixScanStatus _prefixStatus = new();

    public MinitigerDirectoryUpdateService(
        ILibraryManager libraryManager,
        IDirectoryService directoryService,
        ILogger<MinitigerDirectoryUpdateService> logger)
    {
        _libraryManager = libraryManager;
        _directoryService = directoryService;
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
                var found =
                    await ScanPrefixTargetAsync(
                            target.Parent,
                            target.Entry,
                            collectionType,
                            virtualFolder.CollectionType?.ToString()
                                ?? string.Empty)
                        .ConfigureAwait(false);

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
                                + $"{current.NewItems + (found?.NewItems ?? 0)} neue Inhalte gefunden"
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
                    $"Teilscan abgeschlossen · {current.Processed} Root-Inhalte geprüft · "
                    + $"{current.NewItems} neue Inhalte gefunden"
            });
    }

    private async Task<MinitigerLibraryPrefixScanFoundItem?> ScanPrefixTargetAsync(
        Folder parent,
        FileSystemMetadata entry,
        CollectionType? collectionType,
        string libraryType)
    {
        _directoryService.Invalidate(
            entry.FullName);

        var existing =
            _libraryManager.FindByPath(
                entry.FullName,
                entry.IsDirectory);

        var before =
            existing is null
                ? new Dictionary<Guid, BaseItem>()
                : CaptureTree(existing);

        List<BaseItem> roots;

        if (existing is not null)
        {
            roots =
                new List<BaseItem>
                {
                    existing
                };
        }
        else
        {
            var resolved =
                _libraryManager
                    .ResolvePaths(
                        new[] { entry },
                        _directoryService,
                        parent,
                        _libraryManager.GetLibraryOptions(parent),
                        collectionType)
                    .ToList();

            if (resolved.Count == 0)
            {
                throw new InvalidOperationException(
                    "Jellyfin konnte diesen Datei-/Ordnernamen keinem Medientyp zuordnen.");
            }

            foreach (
                var child
                in resolved)
            {
                child.SetParent(parent);
            }

            _libraryManager.CreateItems(
                resolved,
                parent,
                CancellationToken.None);

            roots = resolved;
        }

        var after =
            new Dictionary<Guid, BaseItem>();

        foreach (
            var root
            in roots)
        {
            if (root is Folder folder)
            {
                await folder
                    .ValidateChildren(
                        new Progress<double>(),
                        CreateRefreshOptions(),
                        recursive: true,
                        allowRemoveRoot: false,
                        cancellationToken: CancellationToken.None)
                    .ConfigureAwait(false);
            }
            else
            {
                await root
                    .RefreshMetadata(
                        CreateRefreshOptions(),
                        CancellationToken.None)
                    .ConfigureAwait(false);
            }

            var refreshed =
                _libraryManager.GetItemById(
                    root.Id)
                ?? _libraryManager.FindByPath(
                    root.Path,
                    root is Folder)
                ?? root;

            foreach (
                var pair
                in CaptureTree(
                    refreshed))
            {
                after[pair.Key] =
                    pair.Value;
            }
        }

        var added =
            after
                .Where(pair =>
                    !before.ContainsKey(
                        pair.Key))
                .Select(pair =>
                    pair.Value)
                .ToArray();

        if (added.Length == 0)
        {
            return null;
        }

        var top =
            roots[0];

        var newEpisodes =
            added.Count(item =>
                string.Equals(
                    item.GetType().Name,
                    "Episode",
                    StringComparison.OrdinalIgnoreCase));

        var newBooks =
            added.Count(item =>
                string.Equals(
                    item.GetType().Name,
                    "Book",
                    StringComparison.OrdinalIgnoreCase));

        var meaningfulCount =
            MeaningfulNewItemCount(
                libraryType,
                added,
                newEpisodes,
                newBooks);

        return new MinitigerLibraryPrefixScanFoundItem(
            LibraryKind(
                libraryType),
            top.Name
                ?? EntryName(entry),
            meaningfulCount,
            newEpisodes,
            newBooks,
            FoundSummary(
                libraryType,
                top.Name
                    ?? EntryName(entry),
                meaningfulCount,
                newEpisodes,
                newBooks),
            entry.FullName);
    }

    private Dictionary<Guid, BaseItem> CaptureTree(
        BaseItem root)
    {
        var result =
            new Dictionary<Guid, BaseItem>
            {
                [root.Id] = root
            };

        if (root is not Folder)
        {
            return result;
        }

        var descendants =
            _libraryManager.GetItemList(
                new InternalItemsQuery
                {
                    AncestorIds =
                        new[] { root.Id },
                    Recursive = true
                });

        foreach (
            var item
            in descendants)
        {
            result[item.Id] =
                item;
        }

        return result;
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

    private object? FindVirtualFolder(
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
