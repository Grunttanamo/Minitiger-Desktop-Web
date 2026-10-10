import { useQuery } from '@tanstack/react-query';
import React from 'react';

import { useApi } from 'hooks/useApi';

import {
    getMinitigerBannerSample
} from '../bannerPlaylistUtils';

interface BannerData {
    items: Awaited<
        ReturnType<typeof getMinitigerBannerSample>
    >['items'];
    playlistId?: string;
    playlistName?: string;
    source: 'playlist' | 'random';
}

interface CachedBannerEnvelope {
    savedAt: number;
    data: BannerData;
}

const CACHE_PREFIX =
    'minitiger.banner.lastSuccessful.v6';

const limitItems = (
    data: BannerData,
    maxItems: number
): BannerData => {
    if (
        maxItems <= 0
        || data.items.length <= maxItems
    ) {
        return data;
    }

    return {
        ...data,
        items: data.items.slice(0, maxItems)
    };
};

const readCachedBanner = (
    cacheKey: string,
    maxItems: number
): BannerData | undefined => {
    if (typeof window === 'undefined') {
        return undefined;
    }

    try {
        const raw =
            window.localStorage.getItem(
                cacheKey
            );

        if (!raw) {
            return undefined;
        }

        const parsed =
            JSON.parse(raw) as CachedBannerEnvelope | BannerData;

        const data = (
            'data' in parsed
                ? parsed.data
                : parsed
        ) as BannerData;

        if (
            !Array.isArray(data.items)
            || !data.items.length
        ) {
            return undefined;
        }

        return limitItems(
            data,
            maxItems
        );
    } catch {
        return undefined;
    }
};

const writeCachedBanner = (
    cacheKey: string,
    data: BannerData,
    maxItems: number
) => {
    if (
        typeof window === 'undefined'
        || !data.items.length
    ) {
        return;
    }

    try {
        const envelope: CachedBannerEnvelope = {
            savedAt: Date.now(),
            data: limitItems(
                data,
                maxItems
            )
        };

        window.localStorage.setItem(
            cacheKey,
            JSON.stringify(envelope)
        );
    } catch {
        // Cache is only a performance helper.
    }
};

const clearCachedBanner = (
    cacheKey: string
) => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.removeItem(cacheKey);
    } catch {
        // Cache is optional.
    }
};

const isJellyfinDesktopShell = () => (
    typeof navigator !== 'undefined'
    && /JellyfinDesktop/i.test(
        navigator.userAgent
        ?? ''
    )
);

export const useMinitigerBannerItems = (
    maxItems = 10
) => {
    const {
        __legacyApiClient__: apiClient
    } = useApi();

    const userId =
        apiClient?.getCurrentUserId();
    const serverId =
        apiClient?.serverId();

    const normalizedMaxItems =
        Number.isFinite(maxItems)
            ? Math.max(
                0,
                Math.round(maxItems)
            )
            : 10;

    const cacheKey = React.useMemo(
        () => [
            CACHE_PREFIX,
            serverId ?? 'server',
            userId ?? 'user',
            normalizedMaxItems
        ].join(':'),
        [
            normalizedMaxItems,
            serverId,
            userId
        ]
    );

    const cached =
        React.useMemo(
            () => readCachedBanner(
                cacheKey,
                normalizedMaxItems
            ),
            [
                cacheKey,
                normalizedMaxItems
            ]
        );

    const desktopShell =
        React.useMemo(
            () => isJellyfinDesktopShell(),
            []
        );

    return useQuery({
        queryKey: [
            'Minitiger',
            'BannerPlaylist',
            serverId,
            userId,
            normalizedMaxItems
        ],
        queryFn: async () => {
            if (!apiClient) {
                return cached ?? {
                    items: [],
                    source: 'random' as const
                };
            }

            try {
                /*
                 * Resolve only as many rich Movie/Series DTOs as the banner
                 * can actually rotate through.  The playlist scan stays
                 * lightweight, while large curated pools no longer cause
                 * dozens of expensive detail batches.
                 */
                const full =
                    await getMinitigerBannerSample(
                        apiClient,
                        {
                            maxItems:
                                normalizedMaxItems
                        }
                    );

                if (full.items.length) {
                    writeCachedBanner(
                        cacheKey,
                        full,
                        normalizedMaxItems
                    );

                    return full;
                }

                /*
                 * An existing curated playlist with zero usable entries is
                 * authoritative. Do not silently replace it with random media.
                 */
                if (full.source === 'playlist') {
                    clearCachedBanner(
                        cacheKey
                    );

                    return full;
                }

                return full;
            } catch (error) {
                console.warn(
                    '[Minitiger Hero] Banner-Abfrage fehlgeschlagen – letzter gültiger Stand bleibt aktiv.',
                    error
                );

                return readCachedBanner(
                    cacheKey,
                    normalizedMaxItems
                ) ?? cached ?? {
                    items: [],
                    source: 'random' as const
                };
            }
        },
        enabled:
            Boolean(
                apiClient
                && userId
            ),
        placeholderData: cached,
        staleTime:
            desktopShell
                ? 15 * 60_000
                : 5 * 60_000,
        gcTime: 30 * 60_000,

        /*
         * Jellyfin Desktop loses sessionStorage whenever its shell restarts.
         * The persistent cache above gives it an immediate hero while this
         * lightweight, item-limited query refreshes in the background.
         */
        refetchOnMount: true,
        retry: 1,
        retryDelay: 900,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true
    });
};
