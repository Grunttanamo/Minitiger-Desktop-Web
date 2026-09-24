using Jellyfin.Plugin.MinitigerVirtualSync.TrailerDetection;
using MediaBrowser.Common.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.MinitigerVirtualSync.Api;

[ApiController]
[Route("Minitiger/TrailerDetection")]
[Authorize(Policy = Policies.RequiresElevation)]
public sealed class MinitigerTrailerDetectionController
    : ControllerBase
{
    private readonly MinitigerTrailerDetectionService _service;

    public MinitigerTrailerDetectionController(
        MinitigerTrailerDetectionService service)
    {
        _service = service;
    }

    [HttpPost("Detect")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult> Detect(
        [FromBody] MinitigerTrailerDetectionRequest request,
        CancellationToken cancellationToken)
    {
        var result =
            await _service
                .DetectAndRegisterAsync(
                    request.ItemId,
                    cancellationToken)
                .ConfigureAwait(false);

        return Ok(result);
    }
}

public sealed class MinitigerTrailerDetectionRequest
{
    public Guid ItemId { get; set; }
}
