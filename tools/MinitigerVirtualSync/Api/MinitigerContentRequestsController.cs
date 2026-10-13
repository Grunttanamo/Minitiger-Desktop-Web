using System.Text;
using System.Text.Json;
using MediaBrowser.Common.Api;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MinitigerVirtualSync.Api;

[ApiController]
[Route("Minitiger/ContentRequests")]
[Authorize]
public sealed class MinitigerContentRequestsController : ControllerBase
{
    private const int MaxTitleLength = 180;
    private const int MaxCommentLength = 2000;
    private const int MaxStoredRequests = 500;
    private static readonly TimeSpan SubmissionCooldown = TimeSpan.FromSeconds(3);
    private static readonly HashSet<string> AllowedStatuses = new(StringComparer.Ordinal)
    {
        "Neu", "In Arbeit", "Hinzugefügt", "Nicht gefunden", "Abgelehnt"
    };

    private static readonly HashSet<string> AllowedContentTypes =
        new(StringComparer.Ordinal)
        {
            "Anime",
            "OVA",
            "Anime Film",
            "Serie",
            "Film",
            "Manga",
            "Comic",
            "Musik",
            "Musikvideo"
        };

    private static readonly SemaphoreSlim IoLock = new(1, 1);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private readonly IUserManager _userManager;
    private readonly ILogger<MinitigerContentRequestsController> _logger;

    public MinitigerContentRequestsController(
        IUserManager userManager,
        ILogger<MinitigerContentRequestsController> logger)
    {
        _userManager = userManager;
        _logger = logger;
    }

    [HttpGet]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult> GetRequests(
        CancellationToken cancellationToken)
    {
        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            var state = await LoadStateAsync(
                cancellationToken).ConfigureAwait(false);

            return Ok(
                state.Requests
                    .OrderByDescending(value => value.CreatedAtUtc)
                    .Select(ToResponse)
                    .ToList());
        }
        finally
        {
            IoLock.Release();
        }
    }

    [HttpGet("Mine")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult> GetOwnRequests(CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var requesterId))
            return Unauthorized();

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var state = await LoadStateAsync(cancellationToken).ConfigureAwait(false);
            // Subprofiles are individual Jellyfin technical users, so their
            // authenticated UserId is distinct from the household owner's ID.
            return Ok(state.Requests
                .Where(value => value.RequesterUserId == requesterId)
                .OrderByDescending(value => value.CreatedAtUtc)
                .Select(ToResponse)
                .ToList());
        }
        finally
        {
            IoLock.Release();
        }
    }

    [HttpPost]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult> CreateRequest(
        [FromBody] MinitigerContentRequestCreateRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var requesterUserId))
        {
            return Unauthorized();
        }

        var title = request.Title?.Trim() ?? string.Empty;
        var contentType = request.ContentType?.Trim() ?? string.Empty;
        var comment = request.Comment?.Trim() ?? string.Empty;

        if (
            string.IsNullOrWhiteSpace(title)
            || title.Length > MaxTitleLength)
        {
            return BadRequest(
                $"Title must contain 1-{MaxTitleLength} characters.");
        }

        if (!AllowedContentTypes.Contains(contentType))
        {
            return BadRequest("Unsupported content type.");
        }

        if (comment.Length > MaxCommentLength)
        {
            return BadRequest(
                $"Comment must not exceed {MaxCommentLength} characters.");
        }

        var requester = _userManager.GetUserById(requesterUserId);
        var requesterName = requester is null
            ? requesterUserId.ToString("N")
            : _userManager.GetUserDto(requester).Name?.Trim()
                ?? requesterUserId.ToString("N");

        var record = new MinitigerContentRequestRecord
        {
            Id = Guid.NewGuid(),
            RequesterUserId = requesterUserId,
            RequesterName = requesterName,
            Title = title,
            ContentType = contentType,
            Comment = comment,
            CreatedAtUtc = DateTimeOffset.UtcNow
        };

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            var state = await LoadStateAsync(
                cancellationToken).ConfigureAwait(false);

            // Do not silently delete older requests when the list gets large.
            if (state.Requests.Count >= MaxStoredRequests)
                return StatusCode(StatusCodes.Status503ServiceUnavailable,
                    "Request storage is full. Contact an administrator.");

            // Prevent accidental rapid repeated submissions without taking
            // away a user's ability to submit multiple different wishes.
            var recent = state.Requests.Any(value =>
                value.RequesterUserId == requesterUserId
                && DateTimeOffset.UtcNow - value.CreatedAtUtc < SubmissionCooldown);
            if (recent)
                return StatusCode(StatusCodes.Status429TooManyRequests,
                    "Please wait a few seconds before another request.");

            state.Requests.Add(record);

            await SaveStateAsync(
                state,
                cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            IoLock.Release();
        }

        _logger.LogInformation(
            "Minitiger content request {RequestId} submitted by user {RequesterUserId}.",
            record.Id,
            record.RequesterUserId);

        return Ok(ToResponse(record));
    }

    [HttpPut("{requestId:guid}/Status")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult> UpdateStatus(
        [FromRoute] Guid requestId,
        [FromBody] MinitigerContentRequestStatusUpdate update,
        CancellationToken cancellationToken)
    {
        var status = update.Status?.Trim() ?? string.Empty;
        if (!AllowedStatuses.Contains(status))
            return BadRequest("Unsupported request status.");

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var state = await LoadStateAsync(cancellationToken).ConfigureAwait(false);
            var item = state.Requests.FirstOrDefault(value => value.Id == requestId);
            if (item is null)
                return NotFound();

            item.Status = status;
            item.StatusUpdatedAtUtc = DateTimeOffset.UtcNow;
            await SaveStateAsync(state, cancellationToken).ConfigureAwait(false);
            return Ok(ToResponse(item));
        }
        finally
        {
            IoLock.Release();
        }
    }

    [HttpDelete("{requestId:guid}")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> DeleteRequest(
        [FromRoute] Guid requestId,
        CancellationToken cancellationToken)
    {
        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            var state = await LoadStateAsync(
                cancellationToken).ConfigureAwait(false);
            var removed = state.Requests.RemoveAll(value =>
                value.Id == requestId);

            if (removed == 0)
            {
                return NotFound();
            }

            await SaveStateAsync(
                state,
                cancellationToken).ConfigureAwait(false);

            return NoContent();
        }
        finally
        {
            IoLock.Release();
        }
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        userId = Guid.Empty;
        var raw = User.FindFirst("Jellyfin-UserId")?.Value;

        return Guid.TryParse(raw, out userId)
            && userId != Guid.Empty;
    }

    private static string GetStatePath()
    {
        var dataFolder = Plugin.Instance?.DataFolderPath;

        if (string.IsNullOrWhiteSpace(dataFolder))
        {
            throw new InvalidOperationException(
                "Minitiger plugin data folder is unavailable.");
        }

        Directory.CreateDirectory(dataFolder);

        return Path.Combine(
            dataFolder,
            "content-requests.json"
        );
    }

    private static async Task<MinitigerContentRequestsState> LoadStateAsync(
        CancellationToken cancellationToken)
    {
        var path = GetStatePath();

        if (!System.IO.File.Exists(path))
        {
            return new MinitigerContentRequestsState();
        }

        try
        {
            var json = await System.IO.File.ReadAllTextAsync(
                path,
                Encoding.UTF8,
                cancellationToken).ConfigureAwait(false);

            return JsonSerializer.Deserialize<MinitigerContentRequestsState>(
                json,
                JsonOptions)
                ?? new MinitigerContentRequestsState();
        }
        catch (JsonException)
        {
            return new MinitigerContentRequestsState();
        }
    }

    private static async Task SaveStateAsync(
        MinitigerContentRequestsState state,
        CancellationToken cancellationToken)
    {
        var path = GetStatePath();
        var temporaryPath = path + ".tmp";
        var json = JsonSerializer.Serialize(state, JsonOptions);

        try
        {
            await System.IO.File.WriteAllTextAsync(
                temporaryPath,
                json,
                Encoding.UTF8,
                cancellationToken).ConfigureAwait(false);

            System.IO.File.Move(
                temporaryPath,
                path,
                true);
        }
        finally
        {
            if (System.IO.File.Exists(temporaryPath))
            {
                System.IO.File.Delete(temporaryPath);
            }
        }
    }

    private static MinitigerContentRequestResponse ToResponse(
        MinitigerContentRequestRecord record)
    {
        return new MinitigerContentRequestResponse
        {
            Id = record.Id,
            RequesterUserId = record.RequesterUserId,
            RequesterName = record.RequesterName,
            Title = record.Title,
            ContentType = record.ContentType,
            Comment = record.Comment,
            CreatedAtUtc = record.CreatedAtUtc,
            Status = AllowedStatuses.Contains(record.Status) ? record.Status : "Neu",
            StatusUpdatedAtUtc = record.StatusUpdatedAtUtc
        };
    }
}

public sealed class MinitigerContentRequestStatusUpdate
{
    public string? Status { get; set; }
}

public sealed class MinitigerContentRequestCreateRequest
{
    public string? Title { get; set; }

    public string? ContentType { get; set; }

    public string? Comment { get; set; }
}

public sealed class MinitigerContentRequestsState
{
    public int Version { get; set; } = 1;

    public List<MinitigerContentRequestRecord> Requests { get; set; } = new();
}

public sealed class MinitigerContentRequestRecord
{
    public Guid Id { get; set; }

    public Guid RequesterUserId { get; set; }

    public string RequesterName { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string ContentType { get; set; } = string.Empty;

    public string Comment { get; set; } = string.Empty;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public string Status { get; set; } = "Neu";

    public DateTimeOffset? StatusUpdatedAtUtc { get; set; }
}

public sealed class MinitigerContentRequestResponse
{
    public Guid Id { get; set; }

    public Guid RequesterUserId { get; set; }

    public string RequesterName { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string ContentType { get; set; } = string.Empty;

    public string Comment { get; set; } = string.Empty;

    public DateTimeOffset CreatedAtUtc { get; set; }

    public string Status { get; set; } = "Neu";

    public DateTimeOffset? StatusUpdatedAtUtc { get; set; }
}

// MINITIGER_PATCH_MARKER: CONTENT_REQUESTS_CONTROLLER_V1
