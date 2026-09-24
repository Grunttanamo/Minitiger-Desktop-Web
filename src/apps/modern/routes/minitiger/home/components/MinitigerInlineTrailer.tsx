import type { ApiClient } from 'jellyfin-apiclient';
import React, {
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';

import type { ItemDto } from 'types/base/models/item-dto';

import {
    getMinitigerAccessToken
} from '../bannerPlaylistUtils';

type TrailerItem = ItemDto;

type TrailerSource =
    | {
        kind: 'video';
        url: string;
        key: string;
        mode:
            | 'direct'
            | 'download'
            | 'transcode-h264'
            | 'transcode-vp8'
            | 'transcode-vp9';
    }
    | {
        kind: 'youtube';
        videoId: string;
        key: string;
    };

interface Props {
    apiClient?: ApiClient;
    item?: ItemDto;
    className?: string;
    delayMs?: number;
    onLoadingChange?: (loading: boolean) => void;
    allowYouTube?: boolean;
}

interface TrailerCacheEntry {
    timestamp: number;
    sources: TrailerSource[];
}

interface MinitigerYouTubePlayer {
    playVideo?: () => void;
    pauseVideo?: () => void;
    mute?: () => void;
    destroy?: () => void;
    getIframe?: () => HTMLIFrameElement;
    setOption?: (
        module: string,
        option: string,
        value: unknown
    ) => void;
}

interface MinitigerYouTubeNamespace {
    Player: new (
        element: HTMLElement,
        options: {
            videoId: string;
            width?: string | number;
            height?: string | number;
            playerVars?: Record<string, unknown>;
            events?: {
                onReady?: (event: {
                    target: MinitigerYouTubePlayer;
                }) => void;
                onStateChange?: (event: {
                    data: number;
                    target: MinitigerYouTubePlayer;
                }) => void;
                onError?: (event: {
                    data: number;
                    target: MinitigerYouTubePlayer;
                }) => void;
            };
        }
    ) => MinitigerYouTubePlayer;
    PlayerState?: {
        PLAYING?: number;
    };
}

declare global {
    interface Window {
        YT?: MinitigerYouTubeNamespace;
    }
}

const trailerCache =
    new Map<string, TrailerCacheEntry>();

const CACHE_MS = 60_000;

let youtubeApiPromise:
    Promise<MinitigerYouTubeNamespace>
    | null = null;

const loadYouTubeApi = () => {
    if (typeof window === 'undefined') {
        return Promise.reject(
            new Error('YouTube API benötigt einen Browser.')
        );
    }

    if (window.YT?.Player) {
        return Promise.resolve(window.YT);
    }

    if (youtubeApiPromise) {
        return youtubeApiPromise;
    }

    youtubeApiPromise =
        new Promise<MinitigerYouTubeNamespace>((resolve, reject) => {
            if (
                !document.querySelector(
                    'script[data-minitiger-youtube-api="true"]'
                )
            ) {
                const script =
                    document.createElement('script');

                script.src =
                    'https://www.youtube.com/iframe_api';
                script.async = true;
                script.dataset.minitigerYoutubeApi =
                    'true';
                script.onerror = () => {
                    youtubeApiPromise = null;
                    reject(
                        new Error(
                            'YouTube IFrame API konnte nicht geladen werden.'
                        )
                    );
                };

                document.head.appendChild(script);
            }

            const started = Date.now();
            const timer =
                window.setInterval(() => {
                    if (window.YT?.Player) {
                        window.clearInterval(timer);
                        resolve(window.YT);
                        return;
                    }

                    if (Date.now() - started > 8_000) {
                        window.clearInterval(timer);
                        youtubeApiPromise = null;
                        reject(
                            new Error(
                                'YouTube IFrame API Timeout.'
                            )
                        );
                    }
                }, 60);
        });

    return youtubeApiPromise;
};

const extractYouTubeId = (
    input?: string | null
) => {
    if (!input) {
        return undefined;
    }

    try {
        const url =
            new URL(input);

        const host =
            url.hostname
                .replace(/^www\./, '')
                .toLowerCase();

        if (host === 'youtu.be') {
            return url.pathname
                .split('/')
                .filter(Boolean)[0];
        }

        if (
            host === 'youtube.com'
            || host === 'm.youtube.com'
        ) {
            if (url.pathname === '/watch') {
                return url.searchParams
                    .get('v')
                    ?? undefined;
            }

            const parts =
                url.pathname
                    .split('/')
                    .filter(Boolean);

            if (
                [
                    'embed',
                    'shorts',
                    'live'
                ].includes(
                    parts[0] ?? ''
                )
            ) {
                return parts[1];
            }
        }
    } catch {
        const match =
            input.match(
                /(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([\w-]{6,})/i
            );

        return match?.[1];
    }

    return undefined;
};

const callYouTube = (
    player: MinitigerYouTubePlayer | null | undefined,
    method: 'playVideo' | 'pauseVideo' | 'mute' | 'destroy'
) => {
    const fn = player?.[method];

    if (typeof fn !== 'function') {
        return;
    }

    try {
        fn.call(player);
    } catch (error) {
        console.debug(
            `[Minitiger Trailer] YouTube ${method} wurde vom Client noch nicht bereitgestellt.`,
            error
        );
    }
};

const getClientDeviceId = (
    apiClient: ApiClient
) => {
    const compatible = apiClient as unknown as {
        deviceId?: () => string | null | undefined;
        getDeviceId?: () => string | null | undefined;
    };

    return compatible.deviceId?.()
        ?? compatible.getDeviceId?.()
        ?? undefined;
};

const createPlaySessionId = () => {
    try {
        return globalThis.crypto?.randomUUID?.()
            ?.replace(/-/g, '');
    } catch {
        return undefined;
    }
};

const browserCanPlay = (
    mime: string
) => {
    if (typeof document === 'undefined') {
        return true;
    }

    try {
        return document
            .createElement('video')
            .canPlayType(mime) !== '';
    } catch {
        return true;
    }
};

const isJellyfinDesktopShell = () => {
    if (typeof window === 'undefined') {
        return false;
    }

    const compatibleWindow = window as Window & {
        NativeShell?: unknown;
    };

    return Boolean(compatibleWindow.NativeShell)
        || /QtWebEngine|Jellyfin(?:\s+Desktop|MediaPlayer)|Electron|Tauri/i.test(
            navigator.userAgent
        );
};

const getMediaCodecs = (
    trailer: TrailerItem
) => {
    const source =
        trailer.MediaSources?.[0];

    const streams =
        source?.MediaStreams
        ?? [];

    const videoCodec =
        String(
            streams.find(stream =>
                String(stream.Type ?? '').toLowerCase()
                === 'video'
            )?.Codec
            ?? ''
        ).toLowerCase();

    const audioCodec =
        String(
            streams.find(stream =>
                String(stream.Type ?? '').toLowerCase()
                === 'audio'
            )?.Codec
            ?? ''
        ).toLowerCase();

    const container =
        String(
            source?.Container
            ?? trailer.Container
            ?? ''
        ).toLowerCase();

    return {
        videoCodec,
        audioCodec,
        container
    };
};

const isLikelyBrowserSafe = (
    trailer: TrailerItem
) => {
    const {
        videoCodec,
        audioCodec,
        container
    } = getMediaCodecs(trailer);

    const mp4Like =
        [
            'mp4',
            'm4v',
            'mov'
        ].includes(container);

    const webmLike =
        container === 'webm';

    const mp4Video =
        [
            'h264',
            'avc',
            'avc1'
        ].includes(videoCodec);

    const mp4Audio =
        !audioCodec
        || [
            'aac',
            'mp3'
        ].includes(audioCodec);

    const webmVideo =
        [
            'vp8',
            'vp9',
            'av1'
        ].includes(videoCodec);

    const webmAudio =
        !audioCodec
        || [
            'opus',
            'vorbis'
        ].includes(audioCodec);

    return (
        mp4Like
        && mp4Video
        && mp4Audio
    ) || (
        webmLike
        && webmVideo
        && webmAudio
    );
};

const buildDirectVideoUrl = (
    apiClient: ApiClient,
    trailer: TrailerItem
) => {
    if (!trailer.Id) {
        return undefined;
    }

    const source =
        trailer.MediaSources?.[0];

    const token =
        getMinitigerAccessToken(
            apiClient
        );

    const container = String(
        source?.Container
        ?? trailer.Container
        ?? 'mp4'
    ).split(',')[0].trim().toLowerCase() || 'mp4';

    return apiClient.getUrl(
        `Videos/${trailer.Id}/stream.${container}`,
        {
            ...(source?.Id
                ? { MediaSourceId: source.Id }
                : {}),
            DeviceId:
                getClientDeviceId(apiClient),
            Static: true,
            ...(token
                ? { ApiKey: token }
                : {})
        }
    );
};

const buildDownloadVideoUrl = (
    apiClient: ApiClient,
    trailer: TrailerItem
) => {
    if (!trailer.Id) {
        return undefined;
    }

    const token =
        getMinitigerAccessToken(apiClient);

    return apiClient.getUrl(
        `Items/${trailer.Id}/Download`,
        {
            ...(token
                ? { ApiKey: token }
                : {})
        }
    );
};

const buildForcedTranscodeUrl = (
    apiClient: ApiClient,
    trailer: TrailerItem,
    target: 'h264' | 'vp8' | 'vp9'
) => {
    if (!trailer.Id) {
        return undefined;
    }

    const source =
        trailer.MediaSources?.[0];

    const token =
        getMinitigerAccessToken(
            apiClient
        );

    const isWebm = target === 'vp8' || target === 'vp9';
    const container = isWebm ? 'webm' : 'mp4';
    const videoBitRate = target === 'vp8'
        ? 1_100_000
        : target === 'vp9'
            ? 2_000_000
            : 5_000_000;
    const maxWidth = isWebm ? 640 : 1280;
    const maxHeight = isWebm ? 360 : 720;

    return apiClient.getUrl(
        `Videos/${trailer.Id}/stream.${container}`,
        {
            ...(source?.Id
                ? { MediaSourceId: source.Id }
                : {}),
            DeviceId:
                getClientDeviceId(apiClient),
            PlaySessionId:
                createPlaySessionId(),
            Static: false,
            Container: container,
            Context: 'Streaming',
            VideoCodec: target,
            AudioCodec: isWebm ? 'opus' : 'aac',
            MaxWidth: maxWidth,
            MaxHeight: maxHeight,
            VideoBitRate: videoBitRate,
            AudioBitRate: 128_000,
            AudioChannels: 2,
            MaxAudioChannels: 2,
            TranscodingMaxAudioChannels: 2,
            EnableAutoStreamCopy: false,
            AllowVideoStreamCopy: false,
            AllowAudioStreamCopy: false,
            RequireAvc: !isWebm,
            DeInterlace: true,
            SubtitleStreamIndex: -1,
            ...(token
                ? { ApiKey: token }
                : {})
        }
    );
};

const hydrateTrailerDetails = async (
    apiClient: ApiClient,
    userId: string,
    trailers: TrailerItem[]
): Promise<TrailerItem[]> => {
    const ids = trailers
        .map(trailer => trailer.Id)
        .filter((id): id is string => Boolean(id));

    if (!ids.length) {
        return trailers;
    }

    try {
        const result = await apiClient.getJSON(
            apiClient.getUrl(
                `Users/${userId}/Items`,
                {
                    Ids: ids.join(','),
                    Fields: [
                        'Path',
                        'MediaSources',
                        'MediaStreams',
                        'Container',
                        'ExtraType'
                    ].join(','),
                    EnableTotalRecordCount: false,
                    Limit: ids.length
                }
            )
        );

        const detailedItems = (
            result?.Items ?? []
        ) as TrailerItem[];

        const byId = new Map(
            detailedItems
                .filter(item => Boolean(item.Id))
                .map(item => [ item.Id!, item ])
        );

        return trailers.map(trailer => {
            const detailed = trailer.Id
                ? byId.get(trailer.Id)
                : undefined;

            return detailed
                ? { ...trailer, ...detailed }
                : trailer;
        });
    } catch (error) {
        console.info(
            '[Minitiger Trailer] Trailer-Mediendaten konnten nicht nachgeladen werden',
            error
        );
        return trailers;
    }
};

const isTrailerCandidate = (
    candidate: TrailerItem
) => {
    const name = String(
        candidate.Name
        ?? ''
    ).toLowerCase();

    const path = String(
        candidate.Path
        ?? ''
    ).toLowerCase();

    const extraType = String(
        (
            candidate as ItemDto & {
                ExtraType?: string | null;
            }
        ).ExtraType
        ?? ''
    ).toLowerCase();

    return (
        extraType === 'trailer'
        || /(^|[\\/._ -])trailer([\\/._ -]|$)/i.test(path)
        || /^trailer(?:\s|$)/i.test(name)
    );
};

export const resolveMinitigerLocalTrailers = async (
    apiClient: ApiClient,
    item: ItemDto
): Promise<TrailerItem[]> => {
    if (!item.Id) {
        return [];
    }

    const userId =
        apiClient.getCurrentUserId();

    if (!userId) {
        return [];
    }

    /* Use Jellyfin's own helper first.  Jellyfin Web itself uses this exact
       method for its native "Play trailer" action; it also avoids subtle
       route differences between server versions. */
    try {
        const values =
            await apiClient.getLocalTrailers(
                userId,
                item.Id
            ) as TrailerItem[];

        if (values?.length) {
            return hydrateTrailerDetails(
                apiClient,
                userId,
                values
            );
        }
    } catch (error) {
        console.info(
            '[Minitiger Trailer] Native getLocalTrailers nicht verfügbar',
            error
        );
    }

    try {
        const result =
            await apiClient.getJSON(
                apiClient.getUrl(
                    `Items/${item.Id}/LocalTrailers`,
                    {
                        UserId: userId
                    }
                )
            );

        const values = (
            Array.isArray(result)
                ? result
                : (result?.Items ?? [])
        ) as TrailerItem[];

        if (values.length) {
            return hydrateTrailerDetails(
                apiClient,
                userId,
                values
            );
        }
    } catch (error) {
        console.warn(
            '[Minitiger Trailer] Jellyfin-12 LocalTrailers fehlgeschlagen',
            error
        );
    }

    /* A Trailer.mp4 can also be exposed as a special feature even when the
       parent metadata does not advertise a LocalTrailerCount. */
    try {
        const result =
            await apiClient.getJSON(
                apiClient.getUrl(
                    `Items/${item.Id}/SpecialFeatures`,
                    {
                        UserId: userId
                    }
                )
            );

        const values = (
            Array.isArray(result)
                ? result
                : (result?.Items ?? [])
        ) as TrailerItem[];

        const trailers =
            values.filter(isTrailerCandidate);

        if (trailers.length) {
            return hydrateTrailerDetails(
                apiClient,
                userId,
                trailers
            );
        }
    } catch (error) {
        console.info(
            '[Minitiger Trailer] SpecialFeatures-Fallback nicht verfügbar',
            error
        );
    }

    try {
        const result =
            await apiClient.getItems(
                userId,
                {
                    ParentId: item.Id,
                    Recursive: true,
                    IncludeItemTypes:
                        'Video,Movie,Episode',
                    Fields:
                        'Path,MediaSources,MediaStreams,Container,ExtraType',
                    Limit: 150,
                    EnableTotalRecordCount: false
                }
            );

        const trailers = (
            (result?.Items ?? []) as TrailerItem[]
        ).filter(isTrailerCandidate);

        if (trailers.length) {
            return hydrateTrailerDetails(
                apiClient,
                userId,
                trailers
            );
        }
    } catch (error) {
        console.warn(
            '[Minitiger Trailer] Extra-Fallback fehlgeschlagen',
            error
        );
    }

    return [];
};

export const refreshMinitigerLocalTrailerRegistration = async (
    apiClient: ApiClient,
    item: ItemDto
): Promise<TrailerItem[]> => {
    if (!item.Id) {
        return [];
    }

    const token =
        getMinitigerAccessToken(apiClient);

    const response = await fetch(
        apiClient.getUrl(
            `Items/${item.Id}/Refresh`,
            {
                MetadataRefreshMode: 'None',
                ImageRefreshMode: 'None',
                ReplaceAllMetadata: false,
                ReplaceAllImages: false,
                RegenerateTrickplay: false,
                ...(token ? { ApiKey: token } : {})
            }
        ),
        { method: 'POST' }
    );

    if (!response.ok) {
        throw new Error(
            `Jellyfin Trailer-Refresh fehlgeschlagen: HTTP ${response.status}`
        );
    }

    const cacheKeyBase =
        `${apiClient.serverId?.() ?? 'server'}:${item.Id}`;
    trailerCache.delete(`${cacheKeyBase}:youtube-0`);
    trailerCache.delete(`${cacheKeyBase}:youtube-1`);

    /* Refresh is queued server-side. Poll only this item for a short period;
       no global library scan and no image refresh is triggered here. */
    for (let attempt = 0; attempt < 12; attempt += 1) {
        await new Promise<void>(resolve =>
            window.setTimeout(resolve, attempt === 0 ? 700 : 1_000)
        );

        const trailers =
            await resolveMinitigerLocalTrailers(
                apiClient,
                item
            );

        if (trailers.length) {
            trailerCache.delete(`${cacheKeyBase}:youtube-0`);
            trailerCache.delete(`${cacheKeyBase}:youtube-1`);
            return trailers;
        }
    }

    trailerCache.delete(`${cacheKeyBase}:youtube-0`);
    trailerCache.delete(`${cacheKeyBase}:youtube-1`);
    return [];
};

const resolveSources = async (
    apiClient: ApiClient,
    item: ItemDto,
    allowYouTube = true
): Promise<TrailerSource[]> => {
    if (!item.Id) {
        return [];
    }

    const cacheKey =
        `${apiClient.serverId?.() ?? 'server'}:${item.Id}:youtube-${allowYouTube ? '1' : '0'}`;

    const cached =
        trailerCache.get(cacheKey);

    if (
        cached
        && Date.now()
            - cached.timestamp
            < CACHE_MS
    ) {
        return cached.sources;
    }

    const sources:
        TrailerSource[] = [];

    try {
        const trailers =
            await resolveMinitigerLocalTrailers(
                apiClient,
                item
            );

        if (trailers.length) {
            console.info(
                `[Minitiger Trailer] ${item.Name ?? item.Id}: ${trailers.length} lokale Trailer erkannt.`
            );
        }

        for (const local of trailers) {
            if (!local.Id) {
                continue;
            }

            const {
                videoCodec,
                audioCodec,
                container
            } = getMediaCodecs(local);

            console.info(
                `[Minitiger Trailer] Local ${local.Name ?? local.Id}: container=${container || '?'} video=${videoCodec || '?'} audio=${audioCodec || '?'}`
            );

            const direct =
                buildDirectVideoUrl(
                    apiClient,
                    local
                );

            const download =
                buildDownloadVideoUrl(
                    apiClient,
                    local
                );

            const h264 =
                buildForcedTranscodeUrl(
                    apiClient,
                    local,
                    'h264'
                );

            const vp8 =
                buildForcedTranscodeUrl(
                    apiClient,
                    local,
                    'vp8'
                );

            const vp9 =
                buildForcedTranscodeUrl(
                    apiClient,
                    local,
                    'vp9'
                );

            const canH264 = browserCanPlay(
                'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
            );
            const canVp8 = browserCanPlay(
                'video/webm; codecs="vp8, opus"'
            );
            const canVp9 = browserCanPlay(
                'video/webm; codecs="vp9, opus"'
            );

            const pushH264 = () => {
                if (h264 && canH264) {
                    sources.push({
                        kind: 'video',
                        url: h264,
                        key: `${local.Id}-forced-h264`,
                        mode: 'transcode-h264'
                    });
                }
            };

            const pushVp8 = () => {
                if (vp8 && canVp8) {
                    sources.push({
                        kind: 'video',
                        url: vp8,
                        key: `${local.Id}-forced-vp8`,
                        mode: 'transcode-vp8'
                    });
                }
            };

            const pushVp9 = () => {
                if (vp9 && canVp9) {
                    sources.push({
                        kind: 'video',
                        url: vp9,
                        key: `${local.Id}-forced-vp9`,
                        mode: 'transcode-vp9'
                    });
                }
            };

            const desktopShell =
                isJellyfinDesktopShell();

            const directCodecPlayable = (
                [ 'mp4', 'm4v', 'mov' ].includes(container)
                    ? canH264
                    : container === 'webm'
                        ? (
                            videoCodec === 'vp8'
                                ? canVp8
                                : canVp9
                        )
                        : isLikelyBrowserSafe(local)
            );

            if (desktopShell) {
                /*
                 * Local trailers are intentionally enabled again for the
                 * native Minitiger Desktop test. Qt WebEngine often reports
                 * no H264/AAC support, so prefer a royalty-free WebM
                 * transcode (VP8, then VP9) before direct local playback.
                 *
                 * This restores the original local-trailer behavior so the
                 * interaction with Intro Skipper / library analysis can be
                 * tested under otherwise optimized frontend conditions.
                 */
                if (canVp8) {
                    pushVp8();
                } else {
                    pushVp9();
                }

                if (directCodecPlayable && direct) {
                    sources.push({
                        kind: 'video',
                        url: direct,
                        key: `${local.Id}-desktop-direct`,
                        mode: 'direct'
                    });
                }

                if (directCodecPlayable && download) {
                    sources.push({
                        kind: 'video',
                        url: download,
                        key: `${local.Id}-desktop-download`,
                        mode: 'download'
                    });
                }

                pushH264();
            } else if (isLikelyBrowserSafe(local)) {
                if (direct) {
                    sources.push({
                        kind: 'video',
                        url: direct,
                        key: `${local.Id}-direct`,
                        mode: 'direct'
                    });
                }

                if (download) {
                    sources.push({
                        kind: 'video',
                        url: download,
                        key: `${local.Id}-download`,
                        mode: 'download'
                    });
                }

                pushH264();
                pushVp8();
                pushVp9();
            } else {
                pushH264();
                pushVp8();
                pushVp9();

                if (direct) {
                    sources.push({
                        kind: 'video',
                        url: direct,
                        key: `${local.Id}-direct-last`,
                        mode: 'direct'
                    });
                }
            }
        }
    } catch (error) {
        console.warn(
            '[Minitiger Trailer] Lokaler Trailer konnte nicht geladen werden',
            error
        );
    }

    if (allowYouTube) {
        for (
            const trailer
            of item.RemoteTrailers ?? []
        ) {
            const videoId =
                extractYouTubeId(
                    trailer.Url
                );

            if (!videoId) {
                continue;
            }

            sources.push({
                kind: 'youtube',
                videoId,
                key:
                    `youtube-${videoId}`
            });

            break;
        }
    }

    trailerCache.set(
        cacheKey,
        {
            timestamp:
                Date.now(),
            sources
        }
    );

    return sources;
};



const sanitizeDiagnosticUrl = (input?: string | null) => {
    if (!input) {
        return '-';
    }

    try {
        const url = new URL(input, window.location.href);

        for (const key of [
            'ApiKey',
            'api_key',
            'access_token',
            'X-Emby-Token'
        ]) {
            if (url.searchParams.has(key)) {
                url.searchParams.set(key, '<redacted>');
            }
        }

        return url.toString();
    } catch {
        return input.replace(
            /(ApiKey|api_key|access_token|X-Emby-Token)=([^&]+)/gi,
            '$1=<redacted>'
        );
    }
};

const diagnosticValue = (value: unknown) => {
    if (value === undefined || value === null || value === '') {
        return '-';
    }

    return String(value);
};

const probeVideoSource = async (
    source: Extract<TrailerSource, { kind: 'video' }>
) => {
    if (typeof document === 'undefined') {
        return 'kein DOM verfügbar';
    }

    return new Promise<string>(resolve => {
        const video = document.createElement('video');
        let finished = false;
        let metadata = '';

        const finish = (message: string) => {
            if (finished) {
                return;
            }

            finished = true;
            window.clearTimeout(timer);

            try {
                video.pause();
                video.removeAttribute('src');
                video.load();
                video.remove();
            } catch {
                // Diagnostic cleanup only.
            }

            resolve(message);
        };

        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.style.position = 'fixed';
        video.style.left = '-10000px';
        video.style.top = '-10000px';
        video.style.width = '1px';
        video.style.height = '1px';
        video.style.opacity = '0';
        video.style.pointerEvents = 'none';

        video.addEventListener('loadedmetadata', () => {
            metadata = `${video.videoWidth}x${video.videoHeight}; duration=${Number.isFinite(video.duration) ? video.duration.toFixed(2) : '?'}s`;
        });

        video.addEventListener('playing', () => {
            finish(
                `OK playing (${metadata || 'Metadaten nicht gemeldet'}; readyState=${video.readyState}; networkState=${video.networkState})`
            );
        });

        video.addEventListener('error', () => {
            const error = video.error;

            finish(
                `FEHLER MediaError=${error?.code ?? '?'} ${error?.message ?? ''}; ${metadata || 'keine Metadaten'}; readyState=${video.readyState}; networkState=${video.networkState}`
            );
        });

        const timeoutMs = (
            source.mode === 'transcode-vp8'
            || source.mode === 'transcode-vp9'
        ) ? 20_000 : 8_000;

        const timer = window.setTimeout(() => {
            finish(
                `TIMEOUT nach ${timeoutMs}ms; ${metadata || 'keine Metadaten'}; readyState=${video.readyState}; networkState=${video.networkState}`
            );
        }, timeoutMs);

        document.body.appendChild(video);
        video.src = source.url;
        video.load();

        void video.play().catch(error => {
            /* A play() rejection is useful, but give the element a short
               moment to still emit a concrete media error first. */
            window.setTimeout(() => {
                if (!finished) {
                    finish(
                        `play() REJECTED: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}; ${metadata || 'keine Metadaten'}; readyState=${video.readyState}; networkState=${video.networkState}`
                    );
                }
            }, 250);
        });
    });
};

export const runMinitigerTrailerDiagnostic = async (
    apiClient: ApiClient,
    item: ItemDto
) => {
    const lines: string[] = [];
    const stamp = new Date().toISOString();

    lines.push('=== Minitiger Trailer Diagnose ===');
    lines.push(`Zeit: ${stamp}`);
    lines.push(`Titel: ${item.Name ?? '-'}`);
    lines.push(`ItemId: ${item.Id ?? '-'}`);
    lines.push(`ItemType: ${item.Type ?? '-'}`);
    lines.push(`LocalTrailerCount: ${item.LocalTrailerCount ?? 0}`);
    lines.push(`ClientShell: ${isJellyfinDesktopShell() ? 'Jellyfin Desktop erkannt' : 'Browser/Web'}`);
    lines.push(`UserAgent: ${typeof navigator !== 'undefined' ? navigator.userAgent : '-'}`);
    lines.push(`canPlay H264/AAC MP4: ${browserCanPlay('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')}`);
    lines.push(`canPlay VP8/Opus WebM: ${browserCanPlay('video/webm; codecs="vp8, opus"')}`);
    lines.push(`canPlay VP9/Opus WebM: ${browserCanPlay('video/webm; codecs="vp9, opus"')}`);
    lines.push('');

    const trailers = await resolveMinitigerLocalTrailers(
        apiClient,
        item
    );

    lines.push(`Lokale Trailer erkannt: ${trailers.length}`);

    if (!trailers.length) {
        lines.push('ERGEBNIS: Jellyfin liefert für dieses Item keinen lokalen Trailer an Minitiger.');
        lines.push('HINWEIS: Nutze im Diagnosefenster „Trailer neu einlesen“. Dabei werden Bilder nicht aktualisiert.');
        return lines.join('\n');
    }

    trailers.forEach((trailer, trailerIndex) => {
        const source = trailer.MediaSources?.[0];
        const sourceAny = source as unknown as Record<string, unknown> | undefined;
        const trailerAny = trailer as unknown as Record<string, unknown>;
        const streams = source?.MediaStreams ?? [];

        lines.push('');
        lines.push(`--- Trailer ${trailerIndex + 1} ---`);
        lines.push(`Name: ${trailer.Name ?? '-'}`);
        lines.push(`TrailerId: ${trailer.Id ?? '-'}`);
        lines.push(`Path: ${diagnosticValue(trailerAny.Path)}`);
        lines.push(`Container: ${diagnosticValue(source?.Container ?? trailer.Container)}`);
        lines.push(`MediaSourceId: ${diagnosticValue(source?.Id)}`);
        lines.push(`MediaSourcePath: ${diagnosticValue(sourceAny?.Path)}`);
        lines.push(`Protocol: ${diagnosticValue(sourceAny?.Protocol)}`);
        lines.push(`Size: ${diagnosticValue(sourceAny?.Size)}`);
        lines.push(`Bitrate: ${diagnosticValue(sourceAny?.Bitrate)}`);
        lines.push(`SupportsDirectPlay: ${diagnosticValue(sourceAny?.SupportsDirectPlay)}`);
        lines.push(`SupportsDirectStream: ${diagnosticValue(sourceAny?.SupportsDirectStream)}`);
        lines.push(`SupportsTranscoding: ${diagnosticValue(sourceAny?.SupportsTranscoding)}`);
        lines.push(`DirectStreamUrl(API): ${sanitizeDiagnosticUrl(diagnosticValue(sourceAny?.DirectStreamUrl) === '-' ? undefined : String(sourceAny?.DirectStreamUrl))}`);
        lines.push(`TranscodingUrl(API): ${sanitizeDiagnosticUrl(diagnosticValue(sourceAny?.TranscodingUrl) === '-' ? undefined : String(sourceAny?.TranscodingUrl))}`);

        streams.forEach((stream, streamIndex) => {
            const streamAny = stream as unknown as Record<string, unknown>;
            lines.push(
                `Stream ${streamIndex}: type=${diagnosticValue(stream.Type)} codec=${diagnosticValue(stream.Codec)} profile=${diagnosticValue(streamAny.Profile)} level=${diagnosticValue(streamAny.Level)} index=${diagnosticValue(stream.Index)} size=${diagnosticValue(streamAny.Width)}x${diagnosticValue(streamAny.Height)} bitDepth=${diagnosticValue(streamAny.BitDepth)} pixel=${diagnosticValue(streamAny.PixelFormat)} sampleRate=${diagnosticValue(streamAny.SampleRate)} channels=${diagnosticValue(streamAny.Channels)} title=${diagnosticValue(stream.DisplayTitle)}`
            );
        });

        const direct = buildDirectVideoUrl(apiClient, trailer);
        const download = buildDownloadVideoUrl(apiClient, trailer);
        const h264 = buildForcedTranscodeUrl(apiClient, trailer, 'h264');
        const vp8 = buildForcedTranscodeUrl(apiClient, trailer, 'vp8');
        const vp9 = buildForcedTranscodeUrl(apiClient, trailer, 'vp9');

        lines.push(`Generated Direct: ${sanitizeDiagnosticUrl(direct)}`);
        lines.push(`Generated Download: ${sanitizeDiagnosticUrl(download)}`);
        lines.push(`Generated H264 Transcode: ${sanitizeDiagnosticUrl(h264)}`);
        lines.push(`Generated VP8 Transcode: ${sanitizeDiagnosticUrl(vp8)}`);
        lines.push(`Generated VP9 Transcode: ${sanitizeDiagnosticUrl(vp9)}`);
    });

    lines.push('');
    lines.push('--- Wiedergabe-Probe (erster lokaler Trailer) ---');

    /* Use the exact same source ordering as the real inline player.  This is
       the important part for comparing Browser vs Desktop Client. */
    const sources = await resolveSources(apiClient, item);
    const videoSources = sources
        .filter((source): source is Extract<TrailerSource, { kind: 'video' }> =>
            source.kind === 'video'
        )
        .slice(0, 4);

    if (!videoSources.length) {
        lines.push('Keine lokale Videoquelle wurde erzeugt.');
    }

    for (let index = 0; index < videoSources.length; index++) {
        const source = videoSources[index];
        lines.push(`Probe ${index + 1}: mode=${source.mode}`);
        lines.push(`URL: ${sanitizeDiagnosticUrl(source.url)}`);

        try {
            const result = await probeVideoSource(source);
            lines.push(`Result: ${result}`);
        } catch (error) {
            lines.push(
                `Result: EXCEPTION ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`
            );
        }
    }

    lines.push('');
    lines.push('=== Ende Diagnose ===');

    return lines.join('\n');
};

const MinitigerInlineTrailer = ({
    apiClient,
    item,
    className,
    delayMs = 700,
    onLoadingChange,
    allowYouTube = true
}: Props) => {
    const videoRef =
        useRef<HTMLVideoElement | null>(null);

    const youtubeHostRef =
        useRef<HTMLDivElement | null>(null);

    const youtubeMountRef =
        useRef<HTMLDivElement | null>(null);

    const youtubePlayerRef =
        useRef<MinitigerYouTubePlayer | null>(null);

    const visibilityRef =
        useRef<HTMLElement | null>(null);

    const visibilityStateRef =
        useRef(true);

    const readyStateRef =
        useRef(false);

    const [
        sources,
        setSources
    ] = useState<TrailerSource[]>(
        []
    );

    const [
        sourceIndex,
        setSourceIndex
    ] = useState(0);

    const [
        enabled,
        setEnabled
    ] = useState(false);

    const [
        ready,
        setReady
    ] = useState(false);

    const [
        isVisible,
        setIsVisible
    ] = useState(true);

    useEffect(() => {
        visibilityStateRef.current =
            isVisible;
    }, [isVisible]);

    useEffect(() => {
        readyStateRef.current =
            ready;
    }, [ready]);

    useEffect(() => {
        setSources([]);
        setSourceIndex(0);
        setReady(false);
        setEnabled(false);

        if (
            !apiClient
            || !item?.Id
        ) {
            return;
        }

        let cancelled = false;

        void resolveSources(
            apiClient,
            item,
            allowYouTube
        ).then(result => {
            if (!cancelled) {
                setSources(result);
            }
        });

        const timer =
            window.setTimeout(
                () => {
                    if (!cancelled) {
                        setEnabled(true);
                    }
                },
                delayMs
            );

        return () => {
            cancelled = true;
            window.clearTimeout(
                timer
            );
        };
    }, [
        apiClient,
        delayMs,
        item?.Id,
        allowYouTube
    ]);

    const source =
        sources[sourceIndex];

    const waitingForTrailer = Boolean(
        enabled
        && source
        && isVisible
        && !ready
    );

    useEffect(() => {
        onLoadingChange?.(waitingForTrailer);

        return () => {
            onLoadingChange?.(false);
        };
    }, [
        onLoadingChange,
        waitingForTrailer
    ]);

    const hostClass =
        useMemo(
            () => [
                'minitigerInlineTrailer',
                source?.kind === 'youtube'
                    ? 'isYoutube'
                    : 'isLocalVideo',
                ready
                    ? 'isReady'
                    : '',
                className
            ]
                .filter(Boolean)
                .join(' '),
            [
                className,
                ready,
                source?.kind
            ]
        );

    const advance = () => {
        setReady(false);

        setSourceIndex(index => {
            const next =
                index + 1;

            return next
                < sources.length
                ? next
                : sources.length;
        });
    };

    useEffect(() => {
        const element =
            visibilityRef.current;

        if (!element) {
            return;
        }

        const observer =
            new IntersectionObserver(
                entries => {
                    const visible =
                        Boolean(
                            entries[0]
                                ?.isIntersecting
                            && (
                                entries[0]
                                    ?.intersectionRatio
                                ?? 0
                            ) >= 0.12
                        );

                    setIsVisible(
                        visible
                    );
                },
                {
                    threshold: [
                        0,
                        0.12,
                        0.45
                    ]
                }
            );

        observer.observe(
            element
        );

        return () =>
            observer.disconnect();
    }, [source?.key]);

    useEffect(() => {
        if (
            !enabled
            || !source
            || source.kind !== 'youtube'
            || !youtubeMountRef.current
        ) {
            return;
        }

        let cancelled = false;
        let watchdog = 0;

        void loadYouTubeApi()
            .then(YT => {
                if (
                    cancelled
                    || !youtubeMountRef.current
                ) {
                    return;
                }

                callYouTube(youtubePlayerRef.current, 'destroy');
                youtubePlayerRef.current = null;

                const player =
                    new YT.Player(
                        youtubeMountRef.current,
                        {
                            videoId:
                                source.videoId,
                            width: '100%',
                            height: '100%',
                            playerVars: {
                                autoplay: 1,
                                mute: 1,
                                controls: 0,
                                disablekb: 1,
                                fs: 0,
                                playsinline: 1,
                                rel: 0,
                                modestbranding: 1,
                                iv_load_policy: 3,
                                cc_load_policy: 0,
                                hl: 'de',
                                loop: 1,
                                playlist:
                                    source.videoId
                            },
                            events: {
                                onReady: event => {
                                    callYouTube(event.target, 'mute');

                                    try {
                                        event.target.setOption?.(
                                            'captions',
                                            'track',
                                            {}
                                        );
                                    } catch {
                                        // YouTube may reject this option for some videos.
                                    }

                                    const iframe =
                                        event.target.getIframe?.();

                                    if (iframe) {
                                        iframe.setAttribute(
                                            'tabindex',
                                            '-1'
                                        );
                                        iframe.setAttribute(
                                            'aria-hidden',
                                            'true'
                                        );
                                    }

                                    if (
                                        visibilityStateRef.current
                                    ) {
                                        callYouTube(event.target, 'playVideo');
                                    } else {
                                        callYouTube(event.target, 'pauseVideo');
                                    }
                                },
                                onStateChange: event => {
                                    const playing =
                                        event.data === (
                                            YT.PlayerState?.PLAYING
                                            ?? 1
                                        );

                                    if (playing) {
                                        setReady(true);
                                    }
                                },
                                onError: event => {
                                    console.info(
                                        `[Minitiger Trailer] YouTube ${source.videoId} nicht einbettbar (Code ${event.data}) – Fallback.`
                                    );
                                    advance();
                                }
                            }
                        }
                    );

                youtubePlayerRef.current =
                    player;

                watchdog =
                    window.setTimeout(() => {
                        if (!cancelled && !readyStateRef.current) {
                            console.info(
                                `[Minitiger Trailer] YouTube ${source.videoId} hat nicht rechtzeitig gestartet – Fallback.`
                            );
                            advance();
                        }
                    }, 8_000);
            })
            .catch(error => {
                console.warn(
                    '[Minitiger Trailer] YouTube Player konnte nicht initialisiert werden',
                    error
                );
                advance();
            });

        return () => {
            cancelled = true;

            if (watchdog) {
                window.clearTimeout(
                    watchdog
                );
            }

            callYouTube(youtubePlayerRef.current, 'destroy');
            youtubePlayerRef.current = null;
        };
    }, [
        enabled,
        source?.key
    ]);

    useEffect(() => {
        if (
            !enabled
            || !source
            || source.kind !== 'video'
        ) {
            return;
        }

        const key = source.key;
        const watchdogMs = (
            source.mode === 'transcode-vp8'
            || source.mode === 'transcode-vp9'
        ) ? 20_000 : 7_500;

        const watchdog = window.setTimeout(() => {
            if (!readyStateRef.current) {
                console.info(
                    `[Minitiger Trailer] Lokale Quelle ${key} hat nach ${watchdogMs}ms nicht gestartet – nächste Quelle.`
                );
                advance();
            }
        }, watchdogMs);

        return () =>
            window.clearTimeout(watchdog);
    }, [
        enabled,
        source?.key
    ]);

    useEffect(() => {
        if (!source) {
            return;
        }

        if (source.kind === 'video') {
            const video =
                videoRef.current;

            if (!video) {
                return;
            }

            if (isVisible) {
                void video.play()
                    .catch(() => {
                        // Browser may still block until media is ready.
                    });
            } else {
                video.pause();
            }

            return;
        }

        const player =
            youtubePlayerRef.current;

        if (!player) {
            return;
        }

        if (isVisible) {
            callYouTube(player, 'playVideo');
        } else {
            callYouTube(player, 'pauseVideo');
        }
    }, [
        isVisible,
        ready,
        source
    ]);

    if (
        !enabled
        || !source
    ) {
        return null;
    }

    if (source.kind === 'video') {
        return (
            <video
                ref={element => {
                    videoRef.current = element;
                    visibilityRef.current = element;
                }}
                key={source.key}
                className={hostClass}
                src={source.url}
                autoPlay
                muted
                loop
                playsInline
                preload='metadata'
                disablePictureInPicture
                onCanPlay={() =>
                    setReady(true)
                }
                onPlaying={() =>
                    setReady(true)
                }
                onLoadedMetadata={event => {
                    console.info(
                        `[Minitiger Trailer] Lokale Quelle bereit (${source.mode}) ${event.currentTarget.videoWidth}x${event.currentTarget.videoHeight}.`
                    );
                }}
                onError={event => {
                    const mediaError = event.currentTarget.error;
                    console.info(
                        `[Minitiger Trailer] Lokale Quelle fehlgeschlagen (${source.mode}, code=${mediaError?.code ?? '?'}) – nächste Quelle.`
                    );
                    advance();
                }}
            />
        );
    }

    return (
        <div
            ref={element => {
                youtubeHostRef.current = element;
                visibilityRef.current = element;
            }}
            key={source.key}
            className={hostClass}
            aria-hidden='true'
        >
            <div
                ref={youtubeMountRef}
                className='minitigerYouTubeTrailerMount'
            />
        </div>
    );
};

export default MinitigerInlineTrailer;
