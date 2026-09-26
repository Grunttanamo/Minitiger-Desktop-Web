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

    [HttpGet("Libraries")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult GetLibraries()
        => Ok(
            _service.GetLibraries());

    [HttpPost("Prefix/Start")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult StartPrefixScan(
        [FromBody] MinitigerLibraryPrefixScanRequest request)
        => Ok(
            _service.StartPrefixScan(
                request.LibraryId,
                request.Prefix));

    [HttpGet("Prefix/Status")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult GetPrefixScanStatus()
        => Ok(
            _service.GetPrefixScanStatus());

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

public sealed class MinitigerLibraryPrefixScanRequest
{
    public Guid LibraryId { get; set; }

    public string Prefix { get; set; } = string.Empty;
}
