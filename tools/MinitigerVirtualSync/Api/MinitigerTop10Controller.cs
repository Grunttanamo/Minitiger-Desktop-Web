using System.Collections.Concurrent;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MinitigerVirtualSync.Api;

[ApiController]
[Route("Minitiger/Top10")]
[Authorize]
public sealed class MinitigerTop10Controller : ControllerBase
{
    private static readonly TimeSpan CacheLifetime =
        TimeSpan.FromMinutes(2);

    private static readonly ConcurrentDictionary<
        string,
        CacheEntry
    > Cache = new(StringComparer.Ordinal);

    private readonly ILibraryManager _libraryManager;
    private readonly IUserManager _userManager;
    private readonly ILogger<MinitigerTop10Controller> _logger;

    public MinitigerTop10Controller(
        ILibraryManager libraryManager,
        IUserManager userManager,
        ILogger<MinitigerTop10Controller> logger)
    {
        _libraryManager = libraryManager;
        _userManager = userManager;
        _logger = logger;
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public ActionResult GetTop10(
        [FromQuery] Guid libraryId,
        [FromQuery] string kind,
        [FromQuery] int limit = 40,
        CancellationToken cancellationToken = default)
    {
        if (libraryId == Guid.Empty)
        {
            return BadRequest(new
            {
                message = "libraryId fehlt."
            });
        }

        var normalizedKind =
            NormalizeKind(kind);

        if (normalizedKind is null)
        {
            return BadRequest(new
            {
                message =
                    "kind muss 'movie' oder 'series' sein."
            });
        }

        var requestedLimit =
            Math.Clamp(limit, 10, 100);

        var cacheKey =
            $"{libraryId:N}:{normalizedKind}";

        if (
            Cache.TryGetValue(
                cacheKey,
                out var cached)
            && DateTimeOffset.UtcNow - cached.CreatedAt
                < CacheLifetime)
        {
            return Ok(
                BuildResponse(
                    cached,
                    requestedLimit,
                    true));
        }

        try
        {
            var scores =
                BuildScores(
                    libraryId,
                    normalizedKind,
                    cancellationToken);

            var ranked =
                scores
                    .Select(entry => new RankedItem(
                        entry.Key,
                        entry.Value,
                        _libraryManager
                            .GetItemById(entry.Key)
                            ?.Name
                            ?? string.Empty))
                    .Where(item =>
                        _libraryManager
                            .GetItemById(item.Id)
                            is not null)
                    .OrderByDescending(item =>
                        item.Score)
                    .ThenBy(item =>
                        item.Name,
                        StringComparer.OrdinalIgnoreCase)
                    .ThenBy(item =>
                        item.Id)
                    .Take(100)
                    .ToArray();

            var fresh =
                new CacheEntry(
                    DateTimeOffset.UtcNow,
                    ranked,
                    _userManager
                        .GetUsers()
                        .Count());

            Cache[cacheKey] = fresh;

            return Ok(
                BuildResponse(
                    fresh,
                    requestedLimit,
                    false));
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Minitiger Top 10 konnte fuer Bibliothek {LibraryId} ({Kind}) nicht berechnet werden.",
                libraryId,
                normalizedKind);

            throw;
        }
    }

    private Dictionary<Guid, int> BuildScores(
        Guid libraryId,
        string kind,
        CancellationToken cancellationToken)
    {
        var scores =
            new Dictionary<Guid, int>();

        foreach (var user in _userManager.GetUsers())
        {
            cancellationToken.ThrowIfCancellationRequested();

            var query =
                new InternalItemsQuery(user)
                {
                    Recursive = true,
                    AncestorIds = [libraryId],
                    IncludeItemTypes =
                        kind == "movie"
                            ? [BaseItemKind.Movie]
                            : [BaseItemKind.Episode],
                    IsPlayed = true,
                    IsVirtualItem = false,
                    EnableTotalRecordCount = false
                };

            var playedItems =
                _libraryManager.GetItemList(
                    query);

            if (kind == "movie")
            {
                foreach (
                    var movieId
                    in playedItems
                        .Select(item => item.Id)
                        .Where(id => id != Guid.Empty)
                        .Distinct())
                {
                    scores[movieId] =
                        scores.GetValueOrDefault(
                            movieId)
                        + 1;
                }

                continue;
            }

            foreach (
                var series
                in playedItems
                    .OfType<Episode>()
                    .Where(episode =>
                        episode.SeriesId
                        != Guid.Empty)
                    .GroupBy(episode =>
                        episode.SeriesId))
            {
                /*
                 * Fairness cap requested by Minitiger:
                 * one user contributes at most ten votes to one
                 * series, no matter whether it has 12 or 1,000+
                 * watched episodes.
                 */
                var votes =
                    Math.Min(
                        10,
                        series.Count());

                scores[series.Key] =
                    scores.GetValueOrDefault(
                        series.Key)
                    + votes;
            }
        }

        return scores;
    }

    private static string? NormalizeKind(
        string value)
    {
        var normalized =
            (value ?? string.Empty)
                .Trim()
                .ToLowerInvariant();

        return normalized switch
        {
            "movie" or "movies" => "movie",
            "series" or "tvshows" => "series",
            _ => null
        };
    }

    private static object BuildResponse(
        CacheEntry entry,
        int limit,
        bool cached)
    {
        return new
        {
            generatedAtUtc =
                entry.CreatedAt,
            cached,
            userCount =
                entry.UserCount,
            items =
                entry.Items
                    .Take(limit)
                    .Select((item, index) =>
                        new
                        {
                            rank = index + 1,
                            id = item.Id,
                            score = item.Score
                        })
                    .ToArray()
        };
    }

    private sealed record RankedItem(
        Guid Id,
        int Score,
        string Name);

    private sealed record CacheEntry(
        DateTimeOffset CreatedAt,
        RankedItem[] Items,
        int UserCount);
}
