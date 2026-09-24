using Jellyfin.Plugin.MinitigerVirtualSync.TrailerDownload;
using MediaBrowser.Common.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.MinitigerVirtualSync.Api;

[ApiController]
[Route("Minitiger/TrailerDownload")]
[Authorize(Policy = Policies.RequiresElevation)]
public sealed class MinitigerTrailerDownloadController
    : ControllerBase
{
    private readonly MinitigerTrailerDownloadService _service;

    public MinitigerTrailerDownloadController(
        MinitigerTrailerDownloadService service)
    {
        _service = service;
    }

    [HttpGet("Status")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult Status()
    {
        return Ok(_service.GetStatus());
    }

    [HttpPost("Start")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult Start(
        [FromBody] MinitigerTrailerDownloadStartRequest request)
    {
        try
        {
            return Ok(
                _service.Start(
                    request.ItemId));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(
                new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(
                new { message = ex.Message });
        }
    }

    [HttpPost("Cancel")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult Cancel()
    {
        return Ok(_service.Cancel());
    }
}

public sealed class MinitigerTrailerDownloadStartRequest
{
    public Guid ItemId { get; set; }
}
