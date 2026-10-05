using System.Diagnostics;
using System.Net.Mime;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using MediaBrowser.Common.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MinitigerVirtualSync.Api;

[ApiController]
[Route("Minitiger/VirtualLibraries")]
[Authorize]
public sealed class MinitigerVirtualLibrariesController : ControllerBase
{
    private const long MaxConfigBytes = 4L * 1024 * 1024;
    private const long MaxImageBytes = 15L * 1024 * 1024;
    private const long MaxVideoBytes = 100L * 1024 * 1024;

    private static readonly SemaphoreSlim IoLock = new(1, 1);
    private static readonly Regex SafeId = new("^[A-Za-z0-9_-]{1,64}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    private readonly ILogger<MinitigerVirtualLibrariesController> _logger;

    public MinitigerVirtualLibrariesController(ILogger<MinitigerVirtualLibrariesController> logger)
    {
        _logger = logger;
    }

    [HttpGet("Status")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult GetStatus()
    {
        return Ok(new
        {
            name = "Minitiger Virtual Sync",
            version = "1.0.3",
            ready = Plugin.Instance is not null
        });
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult> GetConfiguration(CancellationToken cancellationToken)
    {
        var configPath = GetConfigurationPath();
        if (configPath is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (!System.IO.File.Exists(configPath))
            {
                return Content("{\"__minitigerServerInitialized\":false}", MediaTypeNames.Application.Json, Encoding.UTF8);
            }

            var json = await System.IO.File.ReadAllTextAsync(configPath, Encoding.UTF8, cancellationToken).ConfigureAwait(false);
            return Content(json, MediaTypeNames.Application.Json, Encoding.UTF8);
        }
        finally
        {
            IoLock.Release();
        }
    }

    [HttpPut]
    [Authorize(Policy = Policies.RequiresElevation)]
    [RequestSizeLimit(MaxConfigBytes)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult> PutConfiguration([FromBody] JsonElement configuration, CancellationToken cancellationToken)
    {
        var configPath = GetConfigurationPath();
        if (configPath is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        string json;
        try
        {
            json = JsonSerializer.Serialize(configuration, JsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Minitiger virtual library configuration could not be serialized.");
            return BadRequest("Invalid JSON configuration.");
        }

        if (Encoding.UTF8.GetByteCount(json) > MaxConfigBytes)
        {
            return BadRequest("Configuration is too large.");
        }

        Directory.CreateDirectory(Path.GetDirectoryName(configPath)!);
        var temporaryPath = configPath + ".tmp";

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await System.IO.File.WriteAllTextAsync(temporaryPath, json, Encoding.UTF8, cancellationToken).ConfigureAwait(false);
            System.IO.File.Move(temporaryPath, configPath, true);
        }
        finally
        {
            TryDelete(temporaryPath);
            IoLock.Release();
        }

        return NoContent();
    }

    [HttpPost("{libraryId}/Media/{kind}")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaxVideoBytes + (2L * 1024 * 1024))]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxVideoBytes + (2L * 1024 * 1024))]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<ActionResult> UploadMedia(
        [FromRoute] string libraryId,
        [FromRoute] string kind,
        [FromForm] IFormFile? file,
        CancellationToken cancellationToken)
    {
        IFormFile? effectiveFile = file;

        if ((effectiveFile is null || effectiveFile.Length <= 0) && Request.HasFormContentType)
        {
            try
            {
                effectiveFile = Request.Form.Files.FirstOrDefault();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Minitiger upload form data could not be read for library {LibraryId} and kind {Kind}.", libraryId, kind);
            }
        }

        if (!TryGetMediaDescriptor(libraryId, kind, effectiveFile, out var descriptor, out var validationError))
        {
            return BadRequest(validationError);
        }

        var mediaDirectory = GetMediaDirectory(libraryId);
        if (mediaDirectory is null)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable);
        }

        Directory.CreateDirectory(mediaDirectory);
        var finalPath = Path.Combine(mediaDirectory, descriptor.FileName);
        var temporaryPath = Path.Combine(mediaDirectory, $".upload-{kind}-{Guid.NewGuid():N}.tmp");

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await using (var output = new FileStream(
                temporaryPath,
                FileMode.Create,
                FileAccess.Write,
                FileShare.None,
                81920,
                useAsync: true))
            {
                await effectiveFile!.CopyToAsync(output, cancellationToken).ConfigureAwait(false);
            }

            DeleteKindFiles(mediaDirectory, kind);
            System.IO.File.Move(temporaryPath, finalPath, true);

            if (kind == "video")
            {
                await TryCreateWebmCompatibilityCopyAsync(
                    finalPath,
                    mediaDirectory,
                    cancellationToken).ConfigureAwait(false);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Minitiger upload could not be stored for library {LibraryId} and kind {Kind}.", libraryId, kind);
            return StatusCode(StatusCodes.Status500InternalServerError, $"Upload could not be stored: {ex.Message}");
        }
        finally
        {
            TryDelete(temporaryPath);
            IoLock.Release();
        }

        var revision = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return Ok(new
        {
            revision,
            size = effectiveFile!.Length,
            contentType = descriptor.ContentType
        });
    }

    [HttpGet("{libraryId}/Media/{kind}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> GetMedia(
        [FromRoute] string libraryId,
        [FromRoute] string kind,
        [FromQuery] string? format = null,
        CancellationToken cancellationToken = default)
    {
        if (!SafeId.IsMatch(libraryId) || !IsKnownKind(kind))
        {
            return NotFound();
        }

        var mediaDirectory = GetMediaDirectory(libraryId);
        if (mediaDirectory is null || !Directory.Exists(mediaDirectory))
        {
            return NotFound();
        }

        string? path;

        if (kind == "video")
        {
            var normalizedFormat = string.Equals(format, "webm", StringComparison.OrdinalIgnoreCase)
                ? "webm"
                : "mp4";
            var preferredPath = Path.Combine(mediaDirectory, $"video.{normalizedFormat}");

            if (normalizedFormat == "webm" && !System.IO.File.Exists(preferredPath))
            {
                var sourceMp4Path = Path.Combine(mediaDirectory, "video.mp4");

                if (System.IO.File.Exists(sourceMp4Path))
                {
                    await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
                    try
                    {
                        if (!System.IO.File.Exists(preferredPath))
                        {
                            await TryCreateWebmCompatibilityCopyAsync(
                                sourceMp4Path,
                                mediaDirectory,
                                cancellationToken).ConfigureAwait(false);
                        }
                    }
                    finally
                    {
                        IoLock.Release();
                    }
                }
            }

            path = System.IO.File.Exists(preferredPath)
                ? preferredPath
                : Directory
                    .EnumerateFiles(mediaDirectory, "video.*")
                    .FirstOrDefault(candidate =>
                        !candidate.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase)
                        && !Path.GetFileName(candidate).StartsWith(".upload-", StringComparison.OrdinalIgnoreCase));
        }
        else
        {
            path = Directory
                .EnumerateFiles(mediaDirectory, kind + ".*")
                .FirstOrDefault(candidate =>
                    !candidate.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase)
                    && !Path.GetFileName(candidate).StartsWith(".upload-", StringComparison.OrdinalIgnoreCase));
        }

        if (path is null || !System.IO.File.Exists(path))
        {
            return NotFound();
        }

        var contentType = GetContentType(path);
        Response.Headers["Cache-Control"] = "private, max-age=31536000, immutable";
        return PhysicalFile(path, contentType, enableRangeProcessing: true);
    }

    [HttpDelete("{libraryId}/Media/{kind}")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<ActionResult> DeleteMedia(
        [FromRoute] string libraryId,
        [FromRoute] string kind,
        CancellationToken cancellationToken)
    {
        if (!SafeId.IsMatch(libraryId) || !IsKnownKind(kind))
        {
            return NoContent();
        }

        var mediaDirectory = GetMediaDirectory(libraryId);
        if (mediaDirectory is null)
        {
            return NoContent();
        }

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (Directory.Exists(mediaDirectory))
            {
                DeleteKindFiles(mediaDirectory, kind);
            }
        }
        finally
        {
            IoLock.Release();
        }

        return NoContent();
    }

    private static string? GetConfigurationPath()
    {
        var dataFolder = Plugin.Instance?.DataFolderPath;
        return string.IsNullOrWhiteSpace(dataFolder)
            ? null
            : Path.Combine(dataFolder, "virtual-libraries.json");
    }

    private static string? GetMediaDirectory(string libraryId)
    {
        if (!SafeId.IsMatch(libraryId))
        {
            return null;
        }

        var dataFolder = Plugin.Instance?.DataFolderPath;
        return string.IsNullOrWhiteSpace(dataFolder)
            ? null
            : Path.Combine(dataFolder, "media", libraryId);
    }

    private static bool IsKnownKind(string kind)
    {
        return kind is "image" or "logo" or "video";
    }

    private static bool TryGetMediaDescriptor(
        string libraryId,
        string kind,
        IFormFile? file,
        out MediaDescriptor descriptor,
        out string validationError)
    {
        descriptor = default;
        validationError = string.Empty;

        if (!SafeId.IsMatch(libraryId))
        {
            validationError = "Invalid virtual library id.";
            return false;
        }

        if (!IsKnownKind(kind))
        {
            validationError = "Unknown media kind.";
            return false;
        }

        if (file is null || file.Length <= 0)
        {
            validationError = "Uploaded file is empty or missing.";
            return false;
        }

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();

        if (kind == "video")
        {
            if (file.Length > MaxVideoBytes || extension != ".mp4")
            {
                validationError = "Virtual hover video must be an MP4 up to 100 MB.";
                return false;
            }

            descriptor = new MediaDescriptor("video.mp4", "video/mp4");
            return true;
        }

        if (file.Length > MaxImageBytes)
        {
            validationError = "Virtual image is too large.";
            return false;
        }

        if (kind == "logo")
        {
            descriptor = extension switch
            {
                ".png" => new MediaDescriptor("logo.png", "image/png"),
                ".webp" => new MediaDescriptor("logo.webp", "image/webp"),
                _ => default
            };

            if (string.IsNullOrWhiteSpace(descriptor.FileName))
            {
                validationError = "Virtual logo must be a PNG or WebP file.";
                return false;
            }

            return true;
        }

        descriptor = extension switch
        {
            ".jpg" or ".jpeg" => new MediaDescriptor("image.jpg", "image/jpeg"),
            ".png" => new MediaDescriptor("image.png", "image/png"),
            ".webp" => new MediaDescriptor("image.webp", "image/webp"),
            ".gif" => new MediaDescriptor("image.gif", "image/gif"),
            _ => default
        };

        if (string.IsNullOrWhiteSpace(descriptor.FileName))
        {
            validationError = "Virtual image must be JPG, PNG, WebP or GIF.";
            return false;
        }

        return true;
    }

    private static string GetContentType(string path)
    {
        return Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            ".mp4" => "video/mp4",
            ".webm" => "video/webm",
            _ => "application/octet-stream"
        };
    }

    private async Task TryCreateWebmCompatibilityCopyAsync(
        string sourcePath,
        string mediaDirectory,
        CancellationToken cancellationToken)
    {
        var ffmpegPath = ResolveFfmpegPath();
        if (ffmpegPath is null)
        {
            _logger.LogWarning(
                "Minitiger virtual hover video: no ffmpeg binary found, WebM compatibility copy was skipped.");
            return;
        }

        var finalWebmPath = Path.Combine(mediaDirectory, "video.webm");
        var temporaryWebmPath = Path.Combine(
            mediaDirectory,
            $".upload-video-webm-{Guid.NewGuid():N}.tmp");

        try
        {
            using var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = ffmpegPath,
                    RedirectStandardError = true,
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            process.StartInfo.ArgumentList.Add("-hide_banner");
            process.StartInfo.ArgumentList.Add("-loglevel");
            process.StartInfo.ArgumentList.Add("error");
            process.StartInfo.ArgumentList.Add("-y");
            process.StartInfo.ArgumentList.Add("-i");
            process.StartInfo.ArgumentList.Add(sourcePath);
            process.StartInfo.ArgumentList.Add("-map");
            process.StartInfo.ArgumentList.Add("0:v:0");
            process.StartInfo.ArgumentList.Add("-an");
            process.StartInfo.ArgumentList.Add("-c:v");
            process.StartInfo.ArgumentList.Add("libvpx");
            process.StartInfo.ArgumentList.Add("-deadline");
            process.StartInfo.ArgumentList.Add("realtime");
            process.StartInfo.ArgumentList.Add("-cpu-used");
            process.StartInfo.ArgumentList.Add("6");
            process.StartInfo.ArgumentList.Add("-crf");
            process.StartInfo.ArgumentList.Add("32");
            process.StartInfo.ArgumentList.Add("-b:v");
            process.StartInfo.ArgumentList.Add("0");
            process.StartInfo.ArgumentList.Add("-pix_fmt");
            process.StartInfo.ArgumentList.Add("yuv420p");
            process.StartInfo.ArgumentList.Add("-f");
            process.StartInfo.ArgumentList.Add("webm");
            process.StartInfo.ArgumentList.Add(temporaryWebmPath);

            if (!process.Start())
            {
                _logger.LogWarning(
                    "Minitiger virtual hover video: ffmpeg process could not be started.");
                return;
            }

            var stderrTask = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
            var stderr = await stderrTask.ConfigureAwait(false);

            if (process.ExitCode != 0 || !System.IO.File.Exists(temporaryWebmPath))
            {
                _logger.LogWarning(
                    "Minitiger virtual hover video: WebM compatibility transcode failed with exit code {ExitCode}: {Error}",
                    process.ExitCode,
                    stderr);
                return;
            }

            System.IO.File.Move(temporaryWebmPath, finalWebmPath, true);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Minitiger virtual hover video: WebM compatibility copy could not be created.");
        }
        finally
        {
            TryDelete(temporaryWebmPath);
        }
    }

    private static string? ResolveFfmpegPath()
    {
        var candidates = new[]
        {
            "/usr/lib/jellyfin-ffmpeg/ffmpeg",
            "/usr/bin/ffmpeg"
        };

        foreach (var candidate in candidates)
        {
            if (System.IO.File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    private static void DeleteKindFiles(string mediaDirectory, string kind)
    {
        foreach (var path in Directory.EnumerateFiles(mediaDirectory, kind + ".*"))
        {
            TryDelete(path);
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (System.IO.File.Exists(path))
            {
                System.IO.File.Delete(path);
            }
        }
        catch
        {
            // Best-effort cleanup only.
        }
    }

    private readonly record struct MediaDescriptor(string FileName, string ContentType);
}

// MINITIGER_PATCH_MARKER: PHASE_18_3_1_2_FORCE_APPLY
