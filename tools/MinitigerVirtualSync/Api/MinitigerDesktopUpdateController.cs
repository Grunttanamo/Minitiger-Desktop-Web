using Jellyfin.Plugin.MinitigerVirtualSync.DesktopUpdate;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.MinitigerVirtualSync.Api;

[ApiController]
[Route("Minitiger/DesktopUpdate")]
public sealed class MinitigerDesktopUpdateController
    : ControllerBase
{
    private readonly MinitigerDesktopUpdateService _service;

    public MinitigerDesktopUpdateController(
        MinitigerDesktopUpdateService service)
    {
        _service =
            service;
    }

    [Authorize]
    [HttpGet("Status")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult> Status(
        [FromQuery] int currentBuild,
        [FromQuery] string packageType,
        CancellationToken cancellationToken)
        => Ok(
            await _service
                .GetStatusAsync(
                    currentBuild,
                    packageType,
                    cancellationToken)
                .ConfigureAwait(false));

    [AllowAnonymous]
    [HttpGet("Download/{token}")]
    public async Task<IActionResult> Download(
        string token,
        CancellationToken cancellationToken)
    {
        var download =
            await _service
                .OpenDownloadAsync(
                    token,
                    cancellationToken)
                .ConfigureAwait(false);

        if (download is null)
        {
            return NotFound(
                new
                {
                    message =
                        "Die Minitiger-Updatefreigabe ist ungültig oder abgelaufen."
                });
        }

        HttpContext.Response.OnCompleted(
            () =>
            {
                download.Response.Dispose();
                return Task.CompletedTask;
            });

        var stream =
            await download.Response.Content
                .ReadAsStreamAsync(
                    cancellationToken)
                .ConfigureAwait(false);

        return File(
            stream,
            "application/octet-stream",
            download.FileName,
            enableRangeProcessing: false);
    }
}
