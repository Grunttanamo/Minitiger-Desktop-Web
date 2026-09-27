using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.MinitigerVirtualSync.DesktopUpdate;

public sealed record MinitigerDesktopUpdateStatus(
    bool Enabled,
    bool Available,
    string Message,
    string Version,
    int CurrentBuild,
    int LatestBuild,
    string PackageType,
    string FileName,
    long Size,
    string Sha256,
    string DownloadPath,
    DateTimeOffset? DownloadExpiresAt);

internal sealed record MinitigerDesktopUpdateDownloadGrant(
    string AssetApiUrl,
    string FileName,
    string Sha256,
    DateTimeOffset ExpiresAt);

internal sealed record MinitigerDesktopUpdateAsset(
    [property: JsonPropertyName("fileName")]
    string FileName,
    [property: JsonPropertyName("sha256")]
    string Sha256,
    [property: JsonPropertyName("size")]
    long Size);

internal sealed record MinitigerDesktopUpdateManifest(
    [property: JsonPropertyName("version")]
    string Version,
    [property: JsonPropertyName("build")]
    int Build,
    [property: JsonPropertyName("commit")]
    string Commit,
    [property: JsonPropertyName("publishedAt")]
    DateTimeOffset PublishedAt,
    [property: JsonPropertyName("notes")]
    string Notes,
    [property: JsonPropertyName("installer")]
    MinitigerDesktopUpdateAsset Installer,
    [property: JsonPropertyName("portable")]
    MinitigerDesktopUpdateAsset Portable);

internal sealed record MinitigerDesktopCachedRelease(
    MinitigerDesktopUpdateManifest Manifest,
    IReadOnlyDictionary<string, string> AssetApiUrls,
    DateTimeOffset LoadedAt);

public sealed record MinitigerDesktopUpdateDownload(
    HttpResponseMessage Response,
    string FileName,
    string Sha256);

public sealed class MinitigerDesktopUpdateService
{
    public const string HttpClientName =
        "MinitigerDesktopUpdate";

    private const string DefaultRepository =
        "Grunttanamo/Minitiger-Desktop-Updates";

    private static readonly TimeSpan CacheDuration =
        TimeSpan.FromMinutes(3);

    private static readonly TimeSpan GrantDuration =
        TimeSpan.FromMinutes(10);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<MinitigerDesktopUpdateService> _logger;
    private readonly SemaphoreSlim _releaseGate =
        new(1, 1);
    private readonly ConcurrentDictionary<
        string,
        MinitigerDesktopUpdateDownloadGrant
    > _downloadGrants =
        new(StringComparer.Ordinal);

    private MinitigerDesktopCachedRelease? _cachedRelease;

    public MinitigerDesktopUpdateService(
        IHttpClientFactory httpClientFactory,
        ILogger<MinitigerDesktopUpdateService> logger)
    {
        _httpClientFactory =
            httpClientFactory;
        _logger =
            logger;
    }

    public async Task<MinitigerDesktopUpdateStatus> GetStatusAsync(
        int currentBuild,
        string? packageType,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Minitiger Desktop update check received: current build {CurrentBuild}, package {PackageType}.",
            currentBuild,
            packageType ?? string.Empty);

        var normalizedPackage =
            NormalizePackageType(
                packageType);

        if (normalizedPackage is null)
        {
            return DisabledStatus(
                currentBuild,
                "unknown",
                "Unbekannter Minitiger-Pakettyp.");
        }

        var token =
            GetGitHubToken();

        if (string.IsNullOrWhiteSpace(token))
        {
            return DisabledStatus(
                currentBuild,
                normalizedPackage,
                "Der private Minitiger-Updatekanal ist auf diesem Jellyfin-Server noch nicht konfiguriert.");
        }

        try
        {
            var release =
                await GetLatestReleaseAsync(
                        token,
                        cancellationToken)
                    .ConfigureAwait(false);

            if (release is null)
            {
                return DisabledStatus(
                    currentBuild,
                    normalizedPackage,
                    "Im privaten Minitiger-Updatekanal wurde noch kein Release gefunden.");
            }

            var manifest =
                release.Manifest;

            var asset =
                normalizedPackage == "portable"
                    ? manifest.Portable
                    : manifest.Installer;

            if (
                currentBuild >= manifest.Build
                || manifest.Build <= 0
            )
            {
                _logger.LogInformation(
                    "Minitiger Desktop update check: client build {CurrentBuild} is current; latest private build is {LatestBuild}.",
                    currentBuild,
                    manifest.Build);

                return new MinitigerDesktopUpdateStatus(
                    Enabled: true,
                    Available: false,
                    Message: "Minitiger Desktop ist aktuell.",
                    Version: manifest.Version,
                    CurrentBuild: currentBuild,
                    LatestBuild: manifest.Build,
                    PackageType: normalizedPackage,
                    FileName: asset.FileName,
                    Size: asset.Size,
                    Sha256: asset.Sha256,
                    DownloadPath: string.Empty,
                    DownloadExpiresAt: null);
            }

            if (
                !release.AssetApiUrls.TryGetValue(
                    asset.FileName,
                    out var assetApiUrl)
                || string.IsNullOrWhiteSpace(
                    assetApiUrl)
            )
            {
                throw new InvalidOperationException(
                    $"Das Update-Asset „{asset.FileName}“ fehlt im privaten GitHub-Release.");
            }

            PruneExpiredGrants();

            var grantToken =
                Convert.ToHexString(
                        RandomNumberGenerator.GetBytes(
                            32))
                    .ToLowerInvariant();

            var expiresAt =
                DateTimeOffset.UtcNow
                    .Add(
                        GrantDuration);

            _downloadGrants[grantToken] =
                new MinitigerDesktopUpdateDownloadGrant(
                    assetApiUrl,
                    asset.FileName,
                    asset.Sha256,
                    expiresAt);

            _logger.LogInformation(
                "Minitiger Desktop update available: client build {CurrentBuild} -> private build {LatestBuild} ({PackageType}).",
                currentBuild,
                manifest.Build,
                normalizedPackage);

            return new MinitigerDesktopUpdateStatus(
                Enabled: true,
                Available: true,
                Message:
                    $"Minitiger Desktop {manifest.Version} · Build {manifest.Build} ist verfügbar.",
                Version: manifest.Version,
                CurrentBuild: currentBuild,
                LatestBuild: manifest.Build,
                PackageType: normalizedPackage,
                FileName: asset.FileName,
                Size: asset.Size,
                Sha256: asset.Sha256,
                DownloadPath:
                    $"Minitiger/DesktopUpdate/Download/{grantToken}",
                DownloadExpiresAt: expiresAt);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Minitiger private Desktop update check failed.");

            return DisabledStatus(
                currentBuild,
                normalizedPackage,
                $"Privater Update-Check fehlgeschlagen: {ex.Message}");
        }
    }

    public async Task<MinitigerDesktopUpdateDownload?> OpenDownloadAsync(
        string token,
        CancellationToken cancellationToken)
    {
        if (
            string.IsNullOrWhiteSpace(
                token)
            || !_downloadGrants.TryGetValue(
                token,
                out var grant)
        )
        {
            return null;
        }

        if (
            grant.ExpiresAt
            <= DateTimeOffset.UtcNow
        )
        {
            _downloadGrants.TryRemove(
                token,
                out _);

            return null;
        }

        var githubToken =
            GetGitHubToken();

        if (
            string.IsNullOrWhiteSpace(
                githubToken)
        )
        {
            return null;
        }

        var client =
            _httpClientFactory.CreateClient(
                HttpClientName);

        using var request =
            CreateGitHubRequest(
                HttpMethod.Get,
                grant.AssetApiUrl,
                githubToken,
                octetStream: true);

        var response =
            await client
                .SendAsync(
                    request,
                    HttpCompletionOption.ResponseHeadersRead,
                    cancellationToken)
                .ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning(
                "Private Minitiger update asset download failed with HTTP {StatusCode}.",
                (int)response.StatusCode);

            response.Dispose();
            return null;
        }

        return new MinitigerDesktopUpdateDownload(
            response,
            grant.FileName,
            grant.Sha256);
    }

    private async Task<MinitigerDesktopCachedRelease?> GetLatestReleaseAsync(
        string token,
        CancellationToken cancellationToken)
    {
        var cached =
            _cachedRelease;

        if (
            cached is not null
            && DateTimeOffset.UtcNow
                - cached.LoadedAt
                < CacheDuration
        )
        {
            return cached;
        }

        await _releaseGate
            .WaitAsync(
                cancellationToken)
            .ConfigureAwait(false);

        try
        {
            cached =
                _cachedRelease;

            if (
                cached is not null
                && DateTimeOffset.UtcNow
                    - cached.LoadedAt
                    < CacheDuration
            )
            {
                return cached;
            }

            var repository =
                GetRepository();

            var client =
                _httpClientFactory.CreateClient(
                    HttpClientName);

            using var request =
                CreateGitHubRequest(
                    HttpMethod.Get,
                    $"repos/{repository}/releases/latest",
                    token);

            using var response =
                await client
                    .SendAsync(
                        request,
                        cancellationToken)
                    .ConfigureAwait(false);

            if (
                response.StatusCode
                == System.Net.HttpStatusCode.NotFound
            )
            {
                return null;
            }

            response.EnsureSuccessStatusCode();

            await using var releaseStream =
                await response.Content
                    .ReadAsStreamAsync(
                        cancellationToken)
                    .ConfigureAwait(false);

            using var document =
                await JsonDocument
                    .ParseAsync(
                        releaseStream,
                        cancellationToken:
                            cancellationToken)
                    .ConfigureAwait(false);

            var assets =
                document.RootElement
                    .GetProperty(
                        "assets");

            var assetUrls =
                new Dictionary<string, string>(
                    StringComparer.OrdinalIgnoreCase);

            string manifestApiUrl =
                string.Empty;

            foreach (
                var asset
                in assets.EnumerateArray())
            {
                var name =
                    asset.GetProperty(
                            "name")
                        .GetString()
                    ?? string.Empty;

                var apiUrl =
                    asset.GetProperty(
                            "url")
                        .GetString()
                    ?? string.Empty;

                if (
                    string.IsNullOrWhiteSpace(
                        name)
                    || string.IsNullOrWhiteSpace(
                        apiUrl)
                )
                {
                    continue;
                }

                assetUrls[name] =
                    apiUrl;

                if (
                    string.Equals(
                        name,
                        "minitiger-update.json",
                        StringComparison.OrdinalIgnoreCase)
                )
                {
                    manifestApiUrl =
                        apiUrl;
                }
            }

            if (
                string.IsNullOrWhiteSpace(
                    manifestApiUrl)
            )
            {
                throw new InvalidOperationException(
                    "Das private Minitiger-Release enthält keine minitiger-update.json.");
            }

            using var manifestRequest =
                CreateGitHubRequest(
                    HttpMethod.Get,
                    manifestApiUrl,
                    token,
                    octetStream: true);

            using var manifestResponse =
                await client
                    .SendAsync(
                        manifestRequest,
                        cancellationToken)
                    .ConfigureAwait(false);

            manifestResponse.EnsureSuccessStatusCode();

            await using var manifestStream =
                await manifestResponse.Content
                    .ReadAsStreamAsync(
                        cancellationToken)
                    .ConfigureAwait(false);

            var manifest =
                await JsonSerializer
                    .DeserializeAsync<MinitigerDesktopUpdateManifest>(
                        manifestStream,
                        cancellationToken:
                            cancellationToken)
                    .ConfigureAwait(false)
                ?? throw new InvalidOperationException(
                    "Das private Minitiger-Update-Manifest ist leer oder ungültig.");

            ValidateManifest(
                manifest);

            var loaded =
                new MinitigerDesktopCachedRelease(
                    manifest,
                    assetUrls,
                    DateTimeOffset.UtcNow);

            _cachedRelease =
                loaded;

            return loaded;
        }
        finally
        {
            _releaseGate.Release();
        }
    }

    private static HttpRequestMessage CreateGitHubRequest(
        HttpMethod method,
        string url,
        string token,
        bool octetStream = false)
    {
        var request =
            new HttpRequestMessage(
                method,
                url);

        request.Headers.Authorization =
            new AuthenticationHeaderValue(
                "Bearer",
                token);

        request.Headers.Accept.Add(
            new MediaTypeWithQualityHeaderValue(
                octetStream
                    ? "application/octet-stream"
                    : "application/vnd.github+json"));

        request.Headers.Add(
            "X-GitHub-Api-Version",
            "2022-11-28");

        return request;
    }

    private static void ValidateManifest(
        MinitigerDesktopUpdateManifest manifest)
    {
        if (
            manifest.Build <= 0
            || string.IsNullOrWhiteSpace(
                manifest.Version)
        )
        {
            throw new InvalidOperationException(
                "Das private Update-Manifest enthält keine gültige Version/Buildnummer.");
        }

        ValidateAsset(
            manifest.Installer,
            "installer");

        ValidateAsset(
            manifest.Portable,
            "portable");
    }

    private static void ValidateAsset(
        MinitigerDesktopUpdateAsset asset,
        string label)
    {
        if (
            string.IsNullOrWhiteSpace(
                asset.FileName)
            || asset.Size <= 0
            || string.IsNullOrWhiteSpace(
                asset.Sha256)
            || asset.Sha256.Length != 64
            || !asset.Sha256.All(
                Uri.IsHexDigit)
        )
        {
            throw new InvalidOperationException(
                $"Das private Update-Manifest enthält ungültige {label}-Metadaten.");
        }
    }

    private static string? NormalizePackageType(
        string? packageType)
    {
        if (
            string.Equals(
                packageType,
                "portable",
                StringComparison.OrdinalIgnoreCase)
        )
        {
            return "portable";
        }

        if (
            string.Equals(
                packageType,
                "installer",
                StringComparison.OrdinalIgnoreCase)
        )
        {
            return "installer";
        }

        return null;
    }

    private static MinitigerDesktopUpdateStatus DisabledStatus(
        int currentBuild,
        string packageType,
        string message)
        => new(
            Enabled: false,
            Available: false,
            Message: message,
            Version: string.Empty,
            CurrentBuild: currentBuild,
            LatestBuild: 0,
            PackageType: packageType,
            FileName: string.Empty,
            Size: 0,
            Sha256: string.Empty,
            DownloadPath: string.Empty,
            DownloadExpiresAt: null);

    private static string GetRepository()
        => (
            Environment.GetEnvironmentVariable(
                "MINITIGER_UPDATE_REPOSITORY")
            ?? DefaultRepository
        ).Trim();

    private static string GetGitHubToken()
        => (
            Environment.GetEnvironmentVariable(
                "MINITIGER_UPDATE_GITHUB_TOKEN")
            ?? string.Empty
        ).Trim();

    private void PruneExpiredGrants()
    {
        var now =
            DateTimeOffset.UtcNow;

        foreach (
            var pair
            in _downloadGrants)
        {
            if (
                pair.Value.ExpiresAt
                <= now
            )
            {
                _downloadGrants.TryRemove(
                    pair.Key,
                    out _);
            }
        }
    }
}
