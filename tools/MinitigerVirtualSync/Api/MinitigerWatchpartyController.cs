using System.Collections.Concurrent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.MinitigerVirtualSync.Api;

// Phase 1: single-server, memory-only, authenticated synchronization rooms.
// Never proxy video or send PlaybackStart/Progress/Stop on behalf of members.
[ApiController]
[Authorize]
[Route("Minitiger/Watchparty")]
public sealed class MinitigerWatchpartyController : ControllerBase
{
    private static readonly ConcurrentDictionary<string, Room> Rooms = new();
    private static readonly TimeSpan RoomTtl = TimeSpan.FromHours(6);
    private static readonly object Gate = new();

    public sealed record CreateRequest(Guid ItemId);
    public sealed record CommandRequest(string Action, long PositionTicks, bool Paused);
    public sealed record JoinRequest(string Code);
    private sealed class Room
    {
        public string Code { get; init; } = "";
        public Guid HostUserId { get; init; }
        public Guid ItemId { get; init; }
        public HashSet<Guid> Members { get; } = [];
        public long Sequence { get; set; }
        public long PositionTicks { get; set; }
        public bool Paused { get; set; } = true;
        public DateTimeOffset UpdatedUtc { get; set; } = DateTimeOffset.UtcNow;
        public string LastAction { get; set; } = "pause";
    }

    private bool Identity(out Guid userId) =>
        Guid.TryParse(User.FindFirst("Jellyfin-UserId")?.Value, out userId)
        && userId != Guid.Empty;

    private static object Snapshot(Room room) => new
    {
        room.Code,
        room.ItemId,
        room.HostUserId,
        Members = room.Members.ToArray(),
        room.Sequence,
        room.PositionTicks,
        room.Paused,
        room.LastAction,
        room.UpdatedUtc
    };

    private static void Prune()
    {
        foreach (var entry in Rooms)
            if (DateTimeOffset.UtcNow - entry.Value.UpdatedUtc > RoomTtl)
                Rooms.TryRemove(entry.Key, out _);
    }

    [HttpPost("Rooms")]
    public IActionResult Create([FromBody] CreateRequest request)
    {
        if (!Identity(out var user)) return Unauthorized();
        if (request.ItemId == Guid.Empty) return BadRequest("itemId required");
        lock (Gate)
        {
            Prune();
            string code;
            do { code = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(4)); }
            while (Rooms.ContainsKey(code));
            var room = new Room { Code = code, HostUserId = user, ItemId = request.ItemId };
            room.Members.Add(user);
            Rooms[code] = room;
            return Ok(Snapshot(room));
        }
    }

    [HttpPost("Rooms/Join")]
    public IActionResult Join([FromBody] JoinRequest request)
    {
        if (!Identity(out var user)) return Unauthorized();
        var code = request.Code?.Trim().ToUpperInvariant() ?? "";
        lock (Gate)
        {
            Prune();
            if (!Rooms.TryGetValue(code, out var room)) return NotFound();
            if (room.Members.Count >= 12 && !room.Members.Contains(user))
                return Conflict("room full");
            room.Members.Add(user);
            room.UpdatedUtc = DateTimeOffset.UtcNow;
            return Ok(Snapshot(room));
        }
    }

    [HttpGet("Rooms/{code}")]
    public IActionResult State(string code)
    {
        if (!Identity(out var user)) return Unauthorized();
        lock (Gate)
        {
            Prune();
            if (!Rooms.TryGetValue(code.ToUpperInvariant(), out var room)) return NotFound();
            if (!room.Members.Contains(user)) return Forbid();
            return Ok(Snapshot(room));
        }
    }

    [HttpPost("Rooms/{code}/Command")]
    public IActionResult Command(string code, [FromBody] CommandRequest request)
    {
        if (!Identity(out var user)) return Unauthorized();
        lock (Gate)
        {
            Prune();
            if (!Rooms.TryGetValue(code.ToUpperInvariant(), out var room)) return NotFound();
            if (!room.Members.Contains(user)) return Forbid();
            if (room.HostUserId != user) return Forbid();
            var action = request.Action?.ToLowerInvariant();
            if (action is not ("play" or "pause" or "seek")) return BadRequest("invalid action");
            if (request.PositionTicks < 0) return BadRequest("invalid position");
            room.PositionTicks = request.PositionTicks;
            room.Paused = action == "pause" || (action == "seek" && request.Paused);
            room.LastAction = action;
            room.Sequence++;
            room.UpdatedUtc = DateTimeOffset.UtcNow;
            return Ok(Snapshot(room));
        }
    }

    [HttpDelete("Rooms/{code}/Members/Me")]
    public IActionResult Leave(string code)
    {
        if (!Identity(out var user)) return Unauthorized();
        lock (Gate)
        {
            if (!Rooms.TryGetValue(code.ToUpperInvariant(), out var room)) return NotFound();
            if (!room.Members.Contains(user)) return Forbid();
            if (room.HostUserId == user) { Rooms.TryRemove(room.Code, out _); return NoContent(); }
            room.Members.Remove(user);
            room.UpdatedUtc = DateTimeOffset.UtcNow;
            return NoContent();
        }
    }
}
