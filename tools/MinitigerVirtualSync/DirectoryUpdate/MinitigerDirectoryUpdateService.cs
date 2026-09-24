using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Providers;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MinitigerVirtualSync.DirectoryUpdate;

public sealed record MinitigerDirectoryUpdateResult(
    string Status,
    string Message,
    Guid RequestedItemId,
    Guid ScanItemId,
    string ScanItemName,
    string ScanPath);

public sealed class MinitigerDirectoryUpdateService
{
    private readonly ILibraryManager _libraryManager;
    private readonly IDirectoryService _directoryService;
    private readonly ILogger<MinitigerDirectoryUpdateService> _logger;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public MinitigerDirectoryUpdateService(
        ILibraryManager libraryManager,
        IDirectoryService directoryService,
        ILogger<MinitigerDirectoryUpdateService> logger)
    {
        _libraryManager = libraryManager;
        _directoryService = directoryService;
        _logger = logger;
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

            /*
             * Clear only this subtree's directory cache and let Jellyfin's own
             * Folder.ValidateChildren pipeline reconcile files, subfolders,
             * local metadata and images. This is the same core mechanism used
             * by a library scan, but scoped to one Series/Folder.
             */
            _directoryService.Invalidate(scanPath);

            var options =
                new MetadataRefreshOptions(
                    _directoryService)
                {
                    MetadataRefreshMode =
                        MediaBrowser.Model.Entities.MetadataRefreshMode.Default,
                    ImageRefreshMode =
                        MediaBrowser.Model.Entities.MetadataRefreshMode.Default,
                    ReplaceAllMetadata = false,
                    ReplaceAllImages = false,
                    RemoveOldMetadata = false,
                    IsAutomated = false
                };

            await scanFolder
                .ValidateChildren(
                    new Progress<double>(),
                    options,
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

    private Folder? ResolveScanFolder(
        BaseItem requested)
    {
        if (requested is Folder folder)
        {
            return folder;
        }

        if (requested.ParentId != Guid.Empty)
        {
            return _libraryManager
                .GetItemById(
                    requested.ParentId)
                as Folder;
        }

        return null;
    }

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
