using System.Diagnostics;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Providers;
using MediaBrowser.Model.Entities;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MinitigerVirtualSync.TrailerDetection;

public sealed record MinitigerTrailerDetectionResult(
    string Status,
    string Message,
    Guid ItemId,
    Guid? TrailerItemId,
    string TrailerPath,
    string VideoCodec);

public sealed class MinitigerTrailerDetectionService
{
    private static readonly string[] SupportedNames =
    {
        "trailer.mp4",
        "trailer.mkv"
    };

    private readonly ILibraryManager _libraryManager;
    private readonly IDirectoryService _directoryService;
    private readonly ILogger<MinitigerTrailerDetectionService> _logger;

    public MinitigerTrailerDetectionService(
        ILibraryManager libraryManager,
        IDirectoryService directoryService,
        ILogger<MinitigerTrailerDetectionService> logger)
    {
        _libraryManager = libraryManager;
        _directoryService = directoryService;
        _logger = logger;
    }

    public async Task<MinitigerTrailerDetectionResult> DetectAndRegisterAsync(
        Guid itemId,
        CancellationToken cancellationToken)
    {
        var item = _libraryManager.GetItemById(itemId);

        if (item is null)
        {
            return Result(
                "incompatible",
                "Die Jellyfin-ID wurde nicht gefunden.",
                itemId);
        }

        var directory = item.ContainingFolderPath;

        if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
        {
            return Result(
                "incompatible",
                "Das Root-Verzeichnis des Inhalts wurde nicht gefunden.",
                itemId);
        }

        string? trailerPath = null;

        try
        {
            trailerPath = Directory
                .EnumerateFiles(
                    directory,
                    "*",
                    SearchOption.TopDirectoryOnly)
                .Where(path => SupportedNames.Contains(
                    Path.GetFileName(path),
                    StringComparer.OrdinalIgnoreCase))
                .OrderBy(path =>
                    Path.GetExtension(path)
                        .Equals(
                            ".mp4",
                            StringComparison.OrdinalIgnoreCase)
                        ? 0
                        : 1)
                .FirstOrDefault();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Minitiger trailer detection could not enumerate {Directory}.",
                directory);

            return Result(
                "incompatible",
                $"Root-Verzeichnis konnte nicht gelesen werden: {ex.Message}",
                itemId);
        }

        if (trailerPath is null)
        {
            return Result(
                "not_found",
                "Scan konnte keinen trailer.mp4 oder trailer.mkv finden.",
                itemId);
        }

        var fileInfo = new FileInfo(trailerPath);

        if (!fileInfo.Exists || fileInfo.Length <= 0)
        {
            return Result(
                "incompatible",
                "Die Trailer-Datei ist leer oder nicht lesbar.",
                itemId,
                trailerPath: trailerPath);
        }

        var probe = await ProbeVideoAsync(
            trailerPath,
            cancellationToken).ConfigureAwait(false);

        if (!probe.Compatible)
        {
            return Result(
                "incompatible",
                probe.Message,
                itemId,
                trailerPath: trailerPath);
        }

        var existing = _libraryManager
            .GetItemList(
                new InternalItemsQuery
                {
                    OwnerIds = new[] { item.Id },
                    ExtraTypes = new[] { ExtraType.Trailer }
                })
            .FirstOrDefault(extra =>
                !string.IsNullOrWhiteSpace(extra.Path)
                && string.Equals(
                    Path.GetFullPath(extra.Path),
                    Path.GetFullPath(trailerPath),
                    StringComparison.OrdinalIgnoreCase));

        if (existing is not null)
        {
            return Result(
                "activated",
                "Scan erfolgreich, Trailer ist bereits aktiviert/eingelesen.",
                itemId,
                existing.Id,
                trailerPath,
                probe.VideoCodec);
        }

        BaseItem? trailer;

        try
        {
            var children =
                _directoryService.GetFileSystemEntries(directory);

            trailer = _libraryManager
                .FindExtras(
                    item,
                    children,
                    _directoryService)
                .FirstOrDefault(extra =>
                    extra.ExtraType == ExtraType.Trailer
                    && !string.IsNullOrWhiteSpace(extra.Path)
                    && string.Equals(
                        Path.GetFullPath(extra.Path),
                        Path.GetFullPath(trailerPath),
                        StringComparison.OrdinalIgnoreCase));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Minitiger trailer detection resolver failed for {ItemId} / {TrailerPath}.",
                itemId,
                trailerPath);

            return Result(
                "incompatible",
                $"Jellyfin konnte die Datei nicht als Trailer auflösen: {ex.Message}",
                itemId,
                trailerPath: trailerPath,
                videoCodec: probe.VideoCodec);
        }

        if (trailer is null)
        {
            return Result(
                "incompatible",
                "Die Datei wurde gefunden, aber Jellyfin erkennt sie nicht als lokalen Trailer.",
                itemId,
                trailerPath: trailerPath,
                videoCodec: probe.VideoCodec);
        }

        try
        {
            trailer.OwnerId = item.Id;
            trailer.ParentId = Guid.Empty;
            trailer.ExtraType = ExtraType.Trailer;

            var alreadyPersisted =
                _libraryManager.GetItemById(trailer.Id);

            if (alreadyPersisted is null)
            {
                _libraryManager.CreateItem(
                    trailer,
                    parent: null);
            }
            else
            {
                alreadyPersisted.OwnerId = item.Id;
                alreadyPersisted.ParentId = Guid.Empty;
                alreadyPersisted.ExtraType = ExtraType.Trailer;

                await alreadyPersisted
                    .UpdateToRepositoryAsync(
                        ItemUpdateType.MetadataEdit,
                        cancellationToken)
                    .ConfigureAwait(false);

                trailer = alreadyPersisted;
            }

            _logger.LogInformation(
                "Minitiger registered local trailer {TrailerId} for {ItemId}: {TrailerPath}",
                trailer.Id,
                itemId,
                trailerPath);

            return Result(
                "activated",
                "Scan erfolgreich, Trailer aktiviert/eingelesen.",
                itemId,
                trailer.Id,
                trailerPath,
                probe.VideoCodec);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Minitiger trailer registration failed for {ItemId} / {TrailerPath}.",
                itemId,
                trailerPath);

            return Result(
                "incompatible",
                $"Trailer wurde gefunden, konnte aber nicht registriert werden: {ex.Message}",
                itemId,
                trailerPath: trailerPath,
                videoCodec: probe.VideoCodec);
        }
    }

    private static MinitigerTrailerDetectionResult Result(
        string status,
        string message,
        Guid itemId,
        Guid? trailerItemId = null,
        string trailerPath = "",
        string videoCodec = "")
        => new(
            status,
            message,
            itemId,
            trailerItemId,
            trailerPath,
            videoCodec);

    private static async Task<(bool Compatible, string Message, string VideoCodec)> ProbeVideoAsync(
        string path,
        CancellationToken cancellationToken)
    {
        var ffprobe = FindFfprobe();

        if (ffprobe is null)
        {
            return (
                true,
                "ffprobe nicht verfügbar; Containerprüfung erfolgreich.",
                string.Empty);
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = ffprobe,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };

        startInfo.ArgumentList.Add("-v");
        startInfo.ArgumentList.Add("error");
        startInfo.ArgumentList.Add("-select_streams");
        startInfo.ArgumentList.Add("v:0");
        startInfo.ArgumentList.Add("-show_entries");
        startInfo.ArgumentList.Add("stream=codec_name");
        startInfo.ArgumentList.Add("-of");
        startInfo.ArgumentList.Add("default=noprint_wrappers=1:nokey=1");
        startInfo.ArgumentList.Add(path);

        using var process = new Process
        {
            StartInfo = startInfo
        };

        try
        {
            if (!process.Start())
            {
                return (
                    false,
                    "ffprobe konnte nicht gestartet werden.",
                    string.Empty);
            }

            var stdoutTask =
                process.StandardOutput.ReadToEndAsync();
            var stderrTask =
                process.StandardError.ReadToEndAsync();

            using var timeout =
                CancellationTokenSource.CreateLinkedTokenSource(
                    cancellationToken);

            timeout.CancelAfter(
                TimeSpan.FromSeconds(15));

            try
            {
                await process
                    .WaitForExitAsync(timeout.Token)
                    .ConfigureAwait(false);
            }
            catch (OperationCanceledException)
                when (!cancellationToken.IsCancellationRequested)
            {
                TryKill(process);

                return (
                    false,
                    "Die Datei konnte innerhalb von 15 Sekunden nicht geprüft werden.",
                    string.Empty);
            }

            var stdout =
                (await stdoutTask.ConfigureAwait(false)).Trim();
            var stderr =
                (await stderrTask.ConfigureAwait(false)).Trim();

            if (process.ExitCode != 0)
            {
                var detail =
                    string.IsNullOrWhiteSpace(stderr)
                        ? $"ffprobe Exit-Code {process.ExitCode}"
                        : stderr.Split(
                            new[] { '\r', '\n' },
                            StringSplitOptions.RemoveEmptyEntries)
                            .LastOrDefault()
                            ?? stderr;

                if (detail.Length > 260)
                {
                    detail = detail[..260];
                }

                return (
                    false,
                    $"Videodatei konnte nicht gelesen werden: {detail}",
                    string.Empty);
            }

            var codec = stdout
                .Split(
                    new[] { '\r', '\n' },
                    StringSplitOptions.RemoveEmptyEntries)
                .Select(value => value.Trim())
                .FirstOrDefault()
                ?? string.Empty;

            if (string.IsNullOrWhiteSpace(codec))
            {
                return (
                    false,
                    "Die Datei enthält keinen erkennbaren Videostream.",
                    string.Empty);
            }

            return (
                true,
                "Videodatei ist kompatibel.",
                codec);
        }
        catch (Exception ex)
        {
            TryKill(process);

            return (
                false,
                $"Videodatei konnte nicht geprüft werden: {ex.Message}",
                string.Empty);
        }
    }

    private static string? FindFfprobe()
    {
        foreach (var candidate in new[]
        {
            "/usr/lib/jellyfin-ffmpeg/ffprobe",
            "/usr/local/bin/ffprobe",
            "/usr/bin/ffprobe"
        })
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        var pathEntries =
            (Environment.GetEnvironmentVariable("PATH")
                ?? string.Empty)
            .Split(
                Path.PathSeparator,
                StringSplitOptions.RemoveEmptyEntries);

        foreach (var directory in pathEntries)
        {
            try
            {
                var candidate =
                    Path.Combine(
                        directory,
                        OperatingSystem.IsWindows()
                            ? "ffprobe.exe"
                            : "ffprobe");

                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
            catch
            {
            }
        }

        return null;
    }

    private static void TryKill(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(
                    entireProcessTree: true);
            }
        }
        catch
        {
        }
    }
}
