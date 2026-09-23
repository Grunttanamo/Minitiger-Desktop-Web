using Jellyfin.Plugin.MinitigerVirtualSync.ImageFix;
using MediaBrowser.Common.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.MinitigerVirtualSync.Api;

[ApiController]
[Route("Minitiger/ImageFix")]
[Authorize(Policy = Policies.RequiresElevation)]
public sealed class MinitigerImageFixController : ControllerBase
{
    private readonly MinitigerImageFixService _service;

    public MinitigerImageFixController(
        MinitigerImageFixService service)
    {
        _service = service;
    }

    [HttpPost("Scan")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult Scan(
        [FromBody] MinitigerImageFixScanRequest request)
    {
        try
        {
            return Ok(
                _service.Scan(
                    request.ToSelection(),
                    request.DeleteOriginals));
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

    [HttpPost("Start")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult Start(
        [FromBody] MinitigerImageFixStartRequest? request)
    {
        try
        {
            return Ok(
                _service.Start(
                    request?.DeleteOriginals
                    ?? false));
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(
                new { message = ex.Message });
        }
    }

    [HttpGet("Status")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult Status()
    {
        return Ok(_service.GetStatus());
    }

    [HttpPost("Cancel")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult Cancel()
    {
        _service.Cancel();
        return Ok(_service.GetStatus());
    }
}

public sealed class MinitigerImageFixScanRequest
{
    public bool Posters { get; set; }

    public bool Backdrops { get; set; }

    public bool SeasonPosters { get; set; }

    public bool Landscape { get; set; }

    public bool Banners { get; set; }

    public bool People { get; set; }

    public bool DeleteOriginals { get; set; }

    public MinitigerImageFixSelection ToSelection()
    {
        return new MinitigerImageFixSelection(
            Posters,
            Backdrops,
            SeasonPosters,
            Landscape,
            Banners,
            People);
    }
}

public sealed class MinitigerImageFixStartRequest
{
    public bool DeleteOriginals { get; set; }
}
