using System.Text;
using System.Text.Json;
using Jellyfin.Data.Enums;
using MediaBrowser.Common.Api;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MinitigerVirtualSync.Api;

[ApiController]
[Route("Minitiger/Community")]
[Authorize]
public sealed class MinitigerCommunityController : ControllerBase
{
    private const int MaxStoredItems = 20000;
    private const int MaxCastSelection = 250;
    private const int BayesianPriorVotes = 5;
    private const double BayesianPriorRating = 7.0;

    private static readonly SemaphoreSlim IoLock = new(1, 1);
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly ILogger<MinitigerCommunityController> _logger;

    public MinitigerCommunityController(
        ILibraryManager libraryManager,
        IUserManager userManager,
        ILogger<MinitigerCommunityController> logger)
    {
        _libraryManager = libraryManager;
        _userManager = userManager;
        _logger = logger;
    }

    [HttpGet("Ratings/{itemId:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult> GetRating(
        [FromRoute] Guid itemId,
        CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var state = await LoadStateAsync(cancellationToken).ConfigureAwait(false);
            var item = state.Ratings.FirstOrDefault(value => value.ItemId == itemId);

            int? ownRating = null;
            if (item is not null)
            {
                var own = item.Votes.FirstOrDefault(value => value.UserId == userId);
                if (own is not null)
                {
                    ownRating = own.Rating;
                }
            }

            return Ok(BuildRatingResponse(itemId, ownRating, item?.Votes ?? []));
        }
        finally
        {
            IoLock.Release();
        }
    }

    [HttpPut("Ratings/{itemId:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult> SetRating(
        [FromRoute] Guid itemId,
        [FromBody] MinitigerRatingUpdateRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        if (request.Rating is < 1 or > 10)
        {
            return BadRequest("Rating must be between 1 and 10.");
        }

        var item = _libraryManager.GetItemById(itemId);
        if (item is null)
        {
            return NotFound();
        }

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var state = await LoadStateAsync(cancellationToken).ConfigureAwait(false);
            var ratingItem = state.Ratings.FirstOrDefault(value => value.ItemId == itemId);

            if (ratingItem is null)
            {
                ratingItem = new MinitigerRatingItem
                {
                    ItemId = itemId
                };
                state.Ratings.Add(ratingItem);
            }

            var vote = ratingItem.Votes.FirstOrDefault(value => value.UserId == userId);
            if (vote is null)
            {
                vote = new MinitigerRatingVote
                {
                    UserId = userId
                };
                ratingItem.Votes.Add(vote);
            }

            vote.Rating = request.Rating;
            vote.UpdatedAtUtc = DateTimeOffset.UtcNow;

            TrimState(state);
            await SaveStateAsync(state, cancellationToken).ConfigureAwait(false);

            return Ok(BuildRatingResponse(itemId, vote.Rating, ratingItem.Votes));
        }
        finally
        {
            IoLock.Release();
        }
    }

    [HttpDelete("Ratings/{itemId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult> ClearRating(
        [FromRoute] Guid itemId,
        CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var userId))
        {
            return Unauthorized();
        }

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var state = await LoadStateAsync(cancellationToken).ConfigureAwait(false);
            var item = state.Ratings.FirstOrDefault(value => value.ItemId == itemId);

            if (item is not null)
            {
                item.Votes.RemoveAll(value => value.UserId == userId);

                if (item.Votes.Count == 0)
                {
                    state.Ratings.Remove(item);
                }

                await SaveStateAsync(state, cancellationToken).ConfigureAwait(false);
            }

            return NoContent();
        }
        finally
        {
            IoLock.Release();
        }
    }

    [HttpGet("Ratings/Top")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult> GetTopRated(
        [FromQuery] Guid libraryId,
        [FromQuery] int limit = 40,
        CancellationToken cancellationToken = default)
    {
        if (libraryId == Guid.Empty)
        {
            return BadRequest("libraryId fehlt.");
        }

        var users = _userManager.GetUsers().ToList();
        var queryUser = users.FirstOrDefault(user =>
            _userManager.GetUserDto(user).Policy?.IsAdministrator == true)
            ?? users.FirstOrDefault();

        if (queryUser is null)
        {
            return Ok(new { items = Array.Empty<object>() });
        }

        var allowedIds = _libraryManager
            .GetItemList(
                new InternalItemsQuery(queryUser)
                {
                    Recursive = true,
                    AncestorIds = [ libraryId ],
                    IsVirtualItem = false,
                    EnableTotalRecordCount = false
                })
            .Select(value => value.Id)
            .Where(value => value != Guid.Empty)
            .ToHashSet();

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var state = await LoadStateAsync(cancellationToken).ConfigureAwait(false);

            var ranked = state.Ratings
                .Where(value =>
                    allowedIds.Contains(value.ItemId)
                    && value.Votes.Count > 0)
                .Select(value =>
                {
                    var average = value.Votes.Average(vote => vote.Rating);
                    var score =
                        (
                            (average * value.Votes.Count)
                            + (BayesianPriorRating * BayesianPriorVotes)
                        )
                        / (value.Votes.Count + BayesianPriorVotes);

                    return new
                    {
                        id = value.ItemId,
                        average,
                        count = value.Votes.Count,
                        score
                    };
                })
                .OrderByDescending(value => value.score)
                .ThenByDescending(value => value.count)
                .ThenByDescending(value => value.average)
                .Take(Math.Clamp(limit, 10, 100))
                .Select((value, index) => new
                {
                    rank = index + 1,
                    value.id,
                    value.average,
                    value.count,
                    value.score
                })
                .ToArray();

            return Ok(new
            {
                generatedAtUtc = DateTimeOffset.UtcNow,
                priorRating = BayesianPriorRating,
                priorVotes = BayesianPriorVotes,
                items = ranked
            });
        }
        finally
        {
            IoLock.Release();
        }
    }

    [HttpGet("Cast/{itemId:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult> GetCastPreference(
        [FromRoute] Guid itemId,
        CancellationToken cancellationToken)
    {
        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var state = await LoadStateAsync(cancellationToken).ConfigureAwait(false);
            var preference = state.CastPreferences.FirstOrDefault(value => value.ItemId == itemId);

            return Ok(new
            {
                enabled = preference is not null && preference.PersonIds.Count > 0,
                selectedIds = preference?.PersonIds ?? []
            });
        }
        finally
        {
            IoLock.Release();
        }
    }

    [HttpPut("Cast/{itemId:guid}")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult> SetCastPreference(
        [FromRoute] Guid itemId,
        [FromBody] MinitigerCastPreferenceUpdateRequest request,
        CancellationToken cancellationToken)
    {
        var ids = (request.SelectedIds ?? [])
            .Select(value => value.Trim())
            .Where(value => Guid.TryParse(value, out _))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(MaxCastSelection)
            .ToList();

        if (ids.Count == 0)
        {
            return BadRequest(
                "Mindestens eine Person muss ausgewählt sein. Nutze Zurücksetzen, um den Jellyfin-Standard wiederherzustellen.");
        }

        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var state = await LoadStateAsync(cancellationToken).ConfigureAwait(false);
            var preference = state.CastPreferences.FirstOrDefault(value => value.ItemId == itemId);

            if (preference is null)
            {
                preference = new MinitigerCastPreference
                {
                    ItemId = itemId
                };
                state.CastPreferences.Add(preference);
            }

            preference.PersonIds = ids;
            preference.UpdatedAtUtc = DateTimeOffset.UtcNow;

            TrimState(state);
            await SaveStateAsync(state, cancellationToken).ConfigureAwait(false);

            return Ok(new
            {
                enabled = true,
                selectedIds = preference.PersonIds
            });
        }
        finally
        {
            IoLock.Release();
        }
    }

    [HttpDelete("Cast/{itemId:guid}")]
    [Authorize(Policy = Policies.RequiresElevation)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<ActionResult> ResetCastPreference(
        [FromRoute] Guid itemId,
        CancellationToken cancellationToken)
    {
        await IoLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var state = await LoadStateAsync(cancellationToken).ConfigureAwait(false);
            state.CastPreferences.RemoveAll(value => value.ItemId == itemId);
            await SaveStateAsync(state, cancellationToken).ConfigureAwait(false);

            return NoContent();
        }
        finally
        {
            IoLock.Release();
        }
    }

    private object BuildRatingResponse(
        Guid itemId,
        int? ownRating,
        IReadOnlyCollection<MinitigerRatingVote> votes)
    {
        var average = votes.Count == 0
            ? (double?)null
            : votes.Average(value => value.Rating);

        return new
        {
            itemId,
            rating = ownRating,
            average,
            count = votes.Count
        };
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        userId = Guid.Empty;
        var raw = User.FindFirst("Jellyfin-UserId")?.Value;

        return Guid.TryParse(raw, out userId)
            && userId != Guid.Empty;
    }

    private static void TrimState(MinitigerCommunityState state)
    {
        if (state.Ratings.Count > MaxStoredItems)
        {
            state.Ratings = state.Ratings
                .OrderByDescending(value =>
                    value.Votes
                        .Select(vote => vote.UpdatedAtUtc)
                        .DefaultIfEmpty(DateTimeOffset.MinValue)
                        .Max())
                .Take(MaxStoredItems)
                .ToList();
        }

        if (state.CastPreferences.Count > MaxStoredItems)
        {
            state.CastPreferences = state.CastPreferences
                .OrderByDescending(value => value.UpdatedAtUtc)
                .Take(MaxStoredItems)
                .ToList();
        }
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
        return Path.Combine(dataFolder, "community.json");
    }

    private static async Task<MinitigerCommunityState> LoadStateAsync(
        CancellationToken cancellationToken)
    {
        var path = GetStatePath();

        if (!System.IO.File.Exists(path))
        {
            return new MinitigerCommunityState();
        }

        try
        {
            var json = await System.IO.File.ReadAllTextAsync(
                path,
                Encoding.UTF8,
                cancellationToken).ConfigureAwait(false);

            return JsonSerializer.Deserialize<MinitigerCommunityState>(
                json,
                JsonOptions)
                ?? new MinitigerCommunityState();
        }
        catch (JsonException)
        {
            return new MinitigerCommunityState();
        }
    }

    private static async Task SaveStateAsync(
        MinitigerCommunityState state,
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

            System.IO.File.Move(temporaryPath, path, true);
        }
        finally
        {
            if (System.IO.File.Exists(temporaryPath))
            {
                System.IO.File.Delete(temporaryPath);
            }
        }
    }
}

public sealed class MinitigerRatingUpdateRequest
{
    public int Rating { get; set; }
}

public sealed class MinitigerCastPreferenceUpdateRequest
{
    public List<string>? SelectedIds { get; set; }
}

public sealed class MinitigerCommunityState
{
    public int Version { get; set; } = 1;

    public List<MinitigerRatingItem> Ratings { get; set; } = new();

    public List<MinitigerCastPreference> CastPreferences { get; set; } = new();
}

public sealed class MinitigerRatingItem
{
    public Guid ItemId { get; set; }

    public List<MinitigerRatingVote> Votes { get; set; } = new();
}

public sealed class MinitigerRatingVote
{
    public Guid UserId { get; set; }

    public int Rating { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; }
}

public sealed class MinitigerCastPreference
{
    public Guid ItemId { get; set; }

    public List<string> PersonIds { get; set; } = new();

    public DateTimeOffset UpdatedAtUtc { get; set; }
}

// MINITIGER_PATCH_MARKER: COMMUNITY_RATINGS_CAST_V1
