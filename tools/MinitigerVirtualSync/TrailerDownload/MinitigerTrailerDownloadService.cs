using System.Diagnostics;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MinitigerVirtualSync.TrailerDownload;

public sealed record MinitigerTrailerDownloadStatus(
    bool Available,
    bool Running,
    bool Completed,
    bool Failed,
    bool CancelRequested,
    Guid? ItemId,
    string ItemName,
    string CurrentStep,
    string Message,
    string TargetPath);

public sealed class MinitigerTrailerDownloadService
{
    private readonly object _gate = new();
    private readonly ILibraryManager _libraryManager;
    private readonly ILogger<MinitigerTrailerDownloadService> _logger;

    private CancellationTokenSource? _cancellation;
    private bool _running;
    private bool _completed;
    private bool _failed;
    private bool _cancelRequested;
    private Guid? _itemId;
    private string _itemName = string.Empty;
    private string _currentStep = string.Empty;
    private string _message = string.Empty;
    private string _targetPath = string.Empty;

    public MinitigerTrailerDownloadService(
        ILibraryManager libraryManager,
        ILogger<MinitigerTrailerDownloadService> logger)
    {
        _libraryManager = libraryManager;
        _logger = logger;
    }

    public MinitigerTrailerDownloadStatus GetStatus()
    {
        lock (_gate)
        {
            return GetStatusUnsafe();
        }
    }

    public MinitigerTrailerDownloadStatus Start(Guid itemId)
    {
        lock (_gate)
        {
            if (_running)
            {
                throw new InvalidOperationException(
                    "Es läuft bereits ein Trailer-Download.");
            }
        }

        var ytDlpPath = FindExecutable(
            OperatingSystem.IsWindows()
                ? new[] { "yt-dlp.exe", "yt-dlp" }
                : new[] { "yt-dlp" });

        if (ytDlpPath is null)
        {
            throw new InvalidOperationException(
                "yt-dlp wurde auf dem Jellyfin-Server nicht gefunden.");
        }

        var item = _libraryManager.GetItemById(itemId)
            ?? throw new ArgumentException(
                "Das Jellyfin-Item wurde nicht gefunden.",
                nameof(itemId));

        var youtubeUrl = item.RemoteTrailers
            .Select(trailer => trailer.Url)
            .FirstOrDefault(IsSupportedYouTubeUrl);

        if (string.IsNullOrWhiteSpace(youtubeUrl))
        {
            throw new InvalidOperationException(
                "Für dieses Item ist kein YouTube-Trailer in Jellyfin hinterlegt.");
        }

        var targetDirectory = item.ContainingFolderPath;

        if (
            string.IsNullOrWhiteSpace(targetDirectory)
            || !Directory.Exists(targetDirectory)
        )
        {
            throw new InvalidOperationException(
                "Das Medienverzeichnis des Jellyfin-Items wurde nicht gefunden.");
        }

        var targetPath = Path.Combine(
            targetDirectory,
            "trailer.mp4");

        if (File.Exists(targetPath))
        {
            throw new InvalidOperationException(
                $"Es existiert bereits ein lokaler Trailer: {targetPath}");
        }

        var cancellation =
            new CancellationTokenSource();

        lock (_gate)
        {
            _running = true;
            _completed = false;
            _failed = false;
            _cancelRequested = false;
            _itemId = item.Id;
            _itemName = item.Name
                ?? item.OriginalTitle
                ?? item.Id.ToString();
            _currentStep = "Download wird vorbereitet";
            _message = string.Empty;
            _targetPath = targetPath;
            _cancellation = cancellation;
        }

        _ = Task.Run(
            () => RunAsync(
                ytDlpPath,
                youtubeUrl,
                targetDirectory,
                targetPath,
                cancellation.Token));

        return GetStatus();
    }

    public MinitigerTrailerDownloadStatus Cancel()
    {
        lock (_gate)
        {
            if (!_running)
            {
                return GetStatusUnsafe();
            }

            _cancelRequested = true;
            _currentStep = "Abbruch angefordert";
            _cancellation?.Cancel();

            return GetStatusUnsafe();
        }
    }

    private async Task RunAsync(
        string ytDlpPath,
        string youtubeUrl,
        string targetDirectory,
        string targetPath,
        CancellationToken cancellationToken)
    {
        var tempPrefix = Path.Combine(
            targetDirectory,
            $".minitiger-trailer-{Guid.NewGuid():N}");

        try
        {
            SetStep("YouTube-Trailer wird geladen");

            var startInfo =
                new ProcessStartInfo
                {
                    FileName = ytDlpPath,
                    WorkingDirectory = targetDirectory,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

            startInfo.ArgumentList.Add("--no-playlist");
            startInfo.ArgumentList.Add("--newline");

            var denoPath = FindExecutable(
                OperatingSystem.IsWindows()
                    ? new[] { "deno.exe", "deno" }
                    : new[] { "deno" });

            if (denoPath is not null)
            {
                startInfo.ArgumentList.Add("--js-runtimes");
                startInfo.ArgumentList.Add(
                    $"deno:{denoPath}");
            }
            startInfo.ArgumentList.Add("--no-overwrites");
            startInfo.ArgumentList.Add("--socket-timeout");
            startInfo.ArgumentList.Add("20");
            startInfo.ArgumentList.Add("--retries");
            startInfo.ArgumentList.Add("3");
            startInfo.ArgumentList.Add("--fragment-retries");
            startInfo.ArgumentList.Add("3");
            startInfo.ArgumentList.Add("--retry-sleep");
            startInfo.ArgumentList.Add("2");
            startInfo.ArgumentList.Add("--format");
            startInfo.ArgumentList.Add(
                "bv*[height<=1080]+ba/b[height<=1080]/b");
            startInfo.ArgumentList.Add("--merge-output-format");
            startInfo.ArgumentList.Add("mp4");
            startInfo.ArgumentList.Add("--remux-video");
            startInfo.ArgumentList.Add("mp4");
            startInfo.ArgumentList.Add("--max-filesize");
            startInfo.ArgumentList.Add("1G");
            startInfo.ArgumentList.Add("--output");
            startInfo.ArgumentList.Add(
                $"{tempPrefix}.%(ext)s");
            startInfo.ArgumentList.Add("--print");
            startInfo.ArgumentList.Add("after_move:filepath");

            var jellyfinFfmpeg =
                "/usr/lib/jellyfin-ffmpeg/ffmpeg";

            if (File.Exists(jellyfinFfmpeg))
            {
                startInfo.ArgumentList.Add(
                    "--ffmpeg-location");
                startInfo.ArgumentList.Add(
                    Path.GetDirectoryName(
                        jellyfinFfmpeg)!);
            }

            startInfo.ArgumentList.Add(youtubeUrl);

            using var process =
                new Process
                {
                    StartInfo = startInfo
                };

            if (!process.Start())
            {
                throw new InvalidOperationException(
                    "yt-dlp konnte nicht gestartet werden.");
            }

            var stdoutTask =
                process.StandardOutput.ReadToEndAsync();
            var stderrTask =
                process.StandardError.ReadToEndAsync();

            using var downloadTimeout =
                CancellationTokenSource
                    .CreateLinkedTokenSource(
                        cancellationToken);

            downloadTimeout.CancelAfter(
                TimeSpan.FromMinutes(3));

            try
            {
                await process
                    .WaitForExitAsync(
                        downloadTimeout.Token)
                    .ConfigureAwait(false);
            }
            catch (OperationCanceledException)
                when (!cancellationToken.IsCancellationRequested)
            {
                TryKill(process);
                throw new TimeoutException(
                    "yt-dlp hat nach 3 Minuten nicht beendet. Der Prozess wurde abgebrochen, damit weitere Trailer-Downloads nicht blockiert werden.");
            }
            catch (OperationCanceledException)
            {
                TryKill(process);
                throw;
            }

            var stdout =
                await stdoutTask.ConfigureAwait(false);
            var stderr =
                await stderrTask.ConfigureAwait(false);

            if (process.ExitCode != 0)
            {
                throw new InvalidOperationException(
                    BuildProcessError(
                        process.ExitCode,
                        stderr));
            }

            cancellationToken
                .ThrowIfCancellationRequested();

            SetStep(
                "MP4 wird ins Medienverzeichnis übernommen");

            var downloadedPath =
                ResolveDownloadedPath(
                    stdout,
                    tempPrefix);

            if (
                downloadedPath is null
                || !File.Exists(downloadedPath)
            )
            {
                throw new FileNotFoundException(
                    "yt-dlp meldete Erfolg, aber die fertige Trailer-Datei wurde nicht gefunden.");
            }

            if (
                !string.Equals(
                    Path.GetExtension(downloadedPath),
                    ".mp4",
                    StringComparison.OrdinalIgnoreCase)
            )
            {
                throw new InvalidDataException(
                    "Der Trailer konnte nicht als MP4 fertiggestellt werden. Bitte ffmpeg auf dem Server prüfen.");
            }

            File.Move(
                downloadedPath,
                targetPath,
                overwrite: false);

            CleanupTemporaryFiles(
                tempPrefix);

            /*
             * The download is finished as soon as the completed MP4 has
             * reached the media folder. Do not enqueue a Jellyfin metadata
             * refresh from inside the plugin here: on some network-backed
             * media paths that refresh can stall or destabilize the server.
             * Jellyfin's normal filesystem/library handling can pick up the
             * new trailer independently.
             */
            lock (_gate)
            {
                _running = false;
                _completed = true;
                _failed = false;
                _cancelRequested = false;
                _currentStep = "Fertig";
                _message =
                    "Trailer wurde als trailer.mp4 gespeichert.";
                _cancellation?.Dispose();
                _cancellation = null;
            }
        }
        catch (OperationCanceledException)
        {
            CleanupTemporaryFiles(
                tempPrefix);

            lock (_gate)
            {
                _running = false;
                _completed = false;
                _failed = false;
                _cancelRequested = false;
                _currentStep = "Abgebrochen";
                _message =
                    "Trailer-Download wurde abgebrochen.";
                _cancellation?.Dispose();
                _cancellation = null;
            }
        }
        catch (Exception ex)
        {
            CleanupTemporaryFiles(
                tempPrefix);

            _logger.LogWarning(
                ex,
                "Minitiger trailer download failed for {ItemId} / {TargetPath}.",
                _itemId,
                targetPath);

            lock (_gate)
            {
                _running = false;
                _completed = false;
                _failed = true;
                _cancelRequested = false;
                _currentStep = "Fehler";
                _message = ex.Message;
                _cancellation?.Dispose();
                _cancellation = null;
            }
        }
    }

    private MinitigerTrailerDownloadStatus
        GetStatusUnsafe()
    {
        return new MinitigerTrailerDownloadStatus(
            FindExecutable(
                OperatingSystem.IsWindows()
                    ? new[] { "yt-dlp.exe", "yt-dlp" }
                    : new[] { "yt-dlp" })
                is not null,
            _running,
            _completed,
            _failed,
            _cancelRequested,
            _itemId,
            _itemName,
            _currentStep,
            _message,
            _targetPath);
    }

    private void SetStep(string step)
    {
        lock (_gate)
        {
            _currentStep = step;
        }
    }

    private static bool IsSupportedYouTubeUrl(
        string? input)
    {
        if (
            string.IsNullOrWhiteSpace(input)
            || !Uri.TryCreate(
                input,
                UriKind.Absolute,
                out var uri)
            || !string.Equals(
                uri.Scheme,
                Uri.UriSchemeHttps,
                StringComparison.OrdinalIgnoreCase)
        )
        {
            return false;
        }

        var host = uri.Host
            .TrimEnd('.')
            .ToLowerInvariant();

        return host is "youtube.com"
            or "www.youtube.com"
            or "m.youtube.com"
            or "youtu.be";
    }

    private static string? FindExecutable(
        IEnumerable<string> names)
    {
        var searchDirectories =
            (Environment.GetEnvironmentVariable(
                "PATH") ?? string.Empty)
            .Split(
                Path.PathSeparator,
                StringSplitOptions.RemoveEmptyEntries);

        foreach (var name in names)
        {
            if (
                Path.IsPathRooted(name)
                && File.Exists(name)
            )
            {
                return name;
            }

            foreach (
                var directory
                in searchDirectories)
            {
                try
                {
                    var candidate =
                        Path.Combine(
                            directory,
                            name);

                    if (File.Exists(candidate))
                    {
                        return candidate;
                    }
                }
                catch
                {
                    // Ignore malformed PATH entries.
                }
            }
        }

        foreach (var candidate in new[]
        {
            "/usr/local/bin/yt-dlp",
            "/usr/bin/yt-dlp"
        })
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    private static string? ResolveDownloadedPath(
        string stdout,
        string tempPrefix)
    {
        var reported = stdout
            .Split(
                new[] { '\r', '\n' },
                StringSplitOptions.RemoveEmptyEntries)
            .Select(line => line.Trim())
            .LastOrDefault(File.Exists);

        if (!string.IsNullOrWhiteSpace(reported))
        {
            return reported;
        }

        var directory =
            Path.GetDirectoryName(tempPrefix);

        if (
            string.IsNullOrWhiteSpace(directory)
            || !Directory.Exists(directory)
        )
        {
            return null;
        }

        var prefixName =
            Path.GetFileName(tempPrefix);

        return Directory
            .EnumerateFiles(
                directory,
                $"{prefixName}.*",
                SearchOption.TopDirectoryOnly)
            .FirstOrDefault(path =>
                !path.EndsWith(
                    ".part",
                    StringComparison.OrdinalIgnoreCase)
                && !path.EndsWith(
                    ".ytdl",
                    StringComparison.OrdinalIgnoreCase));
    }

    private static string BuildProcessError(
        int exitCode,
        string stderr)
    {
        var detail = stderr
            .Split(
                new[] { '\r', '\n' },
                StringSplitOptions.RemoveEmptyEntries)
            .Select(line => line.Trim())
            .LastOrDefault()
            ?? "Unbekannter yt-dlp-Fehler.";

        if (detail.Length > 500)
        {
            detail = detail[..500];
        }

        return
            $"yt-dlp wurde mit Code {exitCode} beendet: {detail}";
    }

    private static void CleanupTemporaryFiles(
        string tempPrefix)
    {
        var directory =
            Path.GetDirectoryName(tempPrefix);

        if (
            string.IsNullOrWhiteSpace(directory)
            || !Directory.Exists(directory)
        )
        {
            return;
        }

        var prefixName =
            Path.GetFileName(tempPrefix);

        foreach (
            var path
            in Directory.EnumerateFiles(
                directory,
                $"{prefixName}*",
                SearchOption.TopDirectoryOnly))
        {
            try
            {
                File.Delete(path);
            }
            catch
            {
                // Cleanup is best effort.
            }
        }
    }

    private static void TryKill(
        Process process)
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
            // Best effort during cancellation.
        }
    }
}
