using Jellyfin.Plugin.MinitigerVirtualSync.DirectoryUpdate;
using MediaBrowser.Common.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.MinitigerVirtualSync.Api;

[ApiController]
[Route("Minitiger/DirectoryUpdate")]
[Authorize(Policy = Policies.RequiresElevation)]
public sealed class MinitigerDirectoryUpdateController
    : ControllerBase
{
    private readonly MinitigerDirectoryUpdateService _service;

    public MinitigerDirectoryUpdateController(
        MinitigerDirectoryUpdateService service)
    {
        _service = service;
    }

    [HttpPost("Run")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult> Run(
        [FromBody] MinitigerDirectoryUpdateRequest request,
        CancellationToken cancellationToken)
    {
        var result =
            await _service
                .UpdateAsync(
                    request.ItemId,
                    cancellationToken)
                .ConfigureAwait(false);

        return Ok(result);
    }
}

public sealed class MinitigerDirectoryUpdateRequest
{
    public Guid ItemId { get; set; }
}
