import type { ApiClient } from 'jellyfin-apiclient';

import type { ItemDto } from 'types/base/models/item-dto';

import { getMinitigerAccessToken } from './apiAuth';
import {
    broadcastMinitigerServerPreference,
    readMinitigerServerPreference
} from './serverPreferences';

export { getMinitigerAccessToken };

export const MINITIGER_BANNER_PLAYLIST_NAMES = [
    'Minitiger Banner',
    'Tanamo Banner'
];

export const MINITIGER_BANNER_LIMIT = 10;

const MINITIGER_BANNER_SERIES_PREF_KEY =
    'bannerSeriesIds.v1';

const MINITIGER_BANNER_GLOBAL_IDS_PREF_KEY =
    'bannerGlobalItemIds.v1';

const MINITIGER_BANNER_PLAYLIST_SCAN_LIMIT = 1000;

/* Keep Jellyfin Users/{userId}/Items query URLs comfortably below the
   server/proxy request-target limit.  A large legacy banner playlist can
   resolve to hundreds of distinct SeriesIds; sending every Id in one GET
   causes HTTP 414 (URI Too Long). */
const MINITIGER_BANNER_ID_BATCH_SIZE = 40;

export interface MinitigerBannerPlaylistInfo {
    playlist?: ItemDto;
    items: ItemDto[];
}

export interface MinitigerBannerSampleOptions {
    /**
     * Maximum number of entries exposed to the hero.
     * 0 means the complete curated pool.
     */
    maxItems?: number;
}

interface PlaylistItemDto extends ItemDto {
    PlaylistItemId?: string | null;
}

interface PlaylistCreationResult {
    Id?: string | null;
    id?: string | null;
}

const normalizeName = (
    value?: string | null
) => String(value ?? '').trim().toLocaleLowerCase();

const uniqueIds = (
    values: Array<string | null | undefined>
) => Array.from(
    new Set(
        values
            .map(value => String(value ?? '').trim())
            .filter(Boolean)
    )
);

export const getMinitigerBannerSeriesIds = async (
    apiClient: ApiClient
): Promise<string[]> => {
    const userId =
        apiClient.getCurrentUserId();

    if (!userId) {
        return [];
    }

    const stored =
        await readMinitigerServerPreference<string[]>(
            apiClient,
            userId,
            MINITIGER_BANNER_SERIES_PREF_KEY
        );

    return uniqueIds(
        Array.isArray(stored)
            ? stored
            : []
    );
};

export const setMinitigerBannerSeriesMembership = async (
    apiClient: ApiClient,
    itemId: string,
    enabled: boolean
) => {
    const current =
        await getMinitigerBannerSeriesIds(
            apiClient
        );

    const next = enabled
        ? uniqueIds([ ...current, itemId ])
        : current.filter(id => id !== itemId);

    await broadcastMinitigerServerPreference(
        apiClient,
        MINITIGER_BANNER_SERIES_PREF_KEY,
        next
    );

    return next;
};

export const getMinitigerGlobalBannerItemIds = async (
    apiClient: ApiClient
): Promise<string[] | null> => {
    const userId =
        apiClient.getCurrentUserId();

    if (!userId) {
        return null;
    }

    const stored =
        await readMinitigerServerPreference<string[]>(
            apiClient,
            userId,
            MINITIGER_BANNER_GLOBAL_IDS_PREF_KEY
        );

    return Array.isArray(stored)
        ? uniqueIds(stored)
        : null;
};

const authenticatedUrl = (
    apiClient: ApiClient,
    path: string,
    params: Record<string, unknown> = {}
) => {
    const token =
        getMinitigerAccessToken(apiClient);

    return apiClient.getUrl(
        path,
        {
            ...params,
            ...(token
                ? { ApiKey: token }
                : {})
        }
    );
};

const request = async <T>(
    apiClient: ApiClient,
    path: string,
    method: 'POST' | 'DELETE',
    params: Record<string, unknown> = {},
    body?: unknown
): Promise<T | undefined> => {
    const response = await fetch(
        authenticatedUrl(
            apiClient,
            path,
            params
        ),
        {
            method,
            headers: body
                ? {
                    'Content-Type':
                        'application/json'
                }
                : undefined,
            body: body
                ? JSON.stringify(body)
                : undefined
        }
    );

    if (!response.ok) {
        throw new Error(
            `Jellyfin ${method} ${path} failed: ${response.status}`
        );
    }

    if (
        response.status === 204
        || response.headers.get(
            'content-length'
        ) === '0'
    ) {
        return undefined;
    }

    const text = await response.text();

    if (!text) {
        return undefined;
    }

    try {
        return JSON.parse(text) as T;
    } catch {
        return undefined;
    }
};

export const findMinitigerBannerPlaylist = async (
    apiClient: ApiClient
): Promise<ItemDto | undefined> => {
    const userId =
        apiClient.getCurrentUserId();

    if (!userId) {
        return undefined;
    }

    const result = await apiClient.getItems(
        userId,
        {
            Recursive: true,
            IncludeItemTypes: 'Playlist',
            SearchTerm: 'Banner',
            Fields:
                'DateCreated,PrimaryImageAspectRatio',
            ImageTypeLimit: 1,
            EnableImageTypes:
                'Primary,Backdrop,Logo,Thumb',
            EnableTotalRecordCount: false,
            Limit: 50
        }
    );

    const playlists =
        (result?.Items ?? []) as ItemDto[];

    return MINITIGER_BANNER_PLAYLIST_NAMES
        .map(name => {
            const wanted =
                normalizeName(name);

            return playlists.find(
                playlist =>
                    normalizeName(
                        playlist.Name
                    ) === wanted
            );
        })
        .find(Boolean);
};

const getPlaylistPage = async (
    apiClient: ApiClient,
    playlistId: string,
    startIndex: number,
    limit: number,
    enableTotalRecordCount: boolean,
    includeImages = false
) => {
    const userId =
        apiClient.getCurrentUserId();

    if (!userId) {
        return {
            Items: [] as ItemDto[],
            TotalRecordCount: 0
        };
    }

    const result = await apiClient.getJSON(
        apiClient.getUrl(
            `Playlists/${playlistId}/Items`,
            {
                Fields: includeImages
                    ? [
                        'Overview',
                        'DateCreated',
                        'PrimaryImageAspectRatio',
                        'MediaSourceCount',
                        'LocalTrailerCount',
                        'RemoteTrailers'
                    ].join(',')
                    : 'DateCreated',
                EnableImageTypes: includeImages
                    ? 'Primary,Backdrop,Logo,Thumb'
                    : undefined,
                ImageTypeLimit: includeImages
                    ? 3
                    : 0,
                EnableTotalRecordCount:
                    enableTotalRecordCount,
                UserId: userId,
                StartIndex: startIndex,
                Limit: limit
            }
        )
    );

    return {
        Items:
            (result?.Items ?? []) as ItemDto[],
        TotalRecordCount:
            Number(
                result?.TotalRecordCount
                ?? result?.Items?.length
                ?? 0
            )
    };
};

const getPlaylistCuratedIds = async (
    apiClient: ApiClient,
    playlistId: string
) => {
    const page =
        await getPlaylistPage(
            apiClient,
            playlistId,
            0,
            MINITIGER_BANNER_PLAYLIST_SCAN_LIMIT,
            false,
            false
        );

    const playlistItems =
        page.Items as PlaylistItemDto[];

    const directIds = playlistItems
        .filter(item => {
            const type =
                String(
                    item.Type
                    ?? ''
                ).toLowerCase();

            return (
                type === 'movie'
                || type === 'series'
            );
        })
        .map(item => item.Id);

    const legacySeriesIds = playlistItems
        .filter(item =>
            String(
                item.Type
                ?? ''
            ).toLowerCase() === 'episode'
        )
        .map(item => item.SeriesId);

    return {
        items: playlistItems,
        ids: uniqueIds([
            ...directIds,
            ...legacySeriesIds
        ])
    };
};

export const setMinitigerGlobalBannerItemMembership = async (
    apiClient: ApiClient,
    itemId: string,
    enabled: boolean
) => {
    let current =
        await getMinitigerGlobalBannerItemIds(
            apiClient
        );

    if (current === null) {
        const playlist =
            await findMinitigerBannerPlaylist(
                apiClient
            );

        if (playlist?.Id) {
            current =
                (
                    await getPlaylistCuratedIds(
                        apiClient,
                        playlist.Id
                    )
                ).ids;
        } else {
            current =
                await getMinitigerBannerSeriesIds(
                    apiClient
                );
        }
    }

    const next = enabled
        ? uniqueIds([
            ...current,
            itemId
        ])
        : current.filter(
            id => id !== itemId
        );

    await broadcastMinitigerServerPreference(
        apiClient,
        MINITIGER_BANNER_GLOBAL_IDS_PREF_KEY,
        next
    );

    return next;
};

const getBannerItemsByIds = async (
    apiClient: ApiClient,
    ids: string[]
): Promise<ItemDto[]> => {
    const userId =
        apiClient.getCurrentUserId();

    const unique = uniqueIds(ids);

    if (!userId || !unique.length) {
        return [];
    }

    const batches: string[][] = [];

    for (
        let index = 0;
        index < unique.length;
        index += MINITIGER_BANNER_ID_BATCH_SIZE
    ) {
        batches.push(
            unique.slice(
                index,
                index + MINITIGER_BANNER_ID_BATCH_SIZE
            )
        );
    }

    /* Keep the requests small enough to avoid HTTP 414, but do not process
       a large legacy banner playlist fully sequentially.  Sequential 40-ID
       batches can easily take longer than the Hero watchdog on a Pi.  Three
       concurrent batches is a deliberate compromise: much faster startup
       without turning the banner refresh into a database request burst. */
    const collected: ItemDto[] = [];
    const concurrency = 3;

    for (
        let index = 0;
        index < batches.length;
        index += concurrency
    ) {
        const group = batches.slice(
            index,
            index + concurrency
        );

        const results = await Promise.all(
            group.map(batch =>
                apiClient.getItems(
                    userId,
                    {
                        Recursive: true,
                        Ids: batch.join(','),
                        Limit: Math.max(
                            batch.length,
                            1
                        ),
                        Fields: [
                            'Overview',
                            'DateCreated',
                            'PrimaryImageAspectRatio',
                            'MediaSourceCount',
                            'LocalTrailerCount',
                            'RemoteTrailers'
                        ].join(','),
                        ImageTypeLimit: 3,
                        EnableImageTypes:
                            'Primary,Backdrop,Logo,Thumb',
                        EnableTotalRecordCount: false,
                        IncludeItemTypes:
                            'Movie,Series'
                    }
                )
            )
        );

        results.forEach(result => {
            collected.push(
                ...((result?.Items ?? []) as ItemDto[])
            );
        });
    }

    const validById = new Map(
        collected
            .filter(item => {
                const type = String(
                    item.Type
                    ?? ''
                ).toLowerCase();

                return Boolean(
                    item.Id
                    && (
                        type === 'movie'
                        || type === 'series'
                    )
                );
            })
            .map(item => [ item.Id!, item ] as const)
    );

    /* Re-apply the curated ID order because Jellyfin does not guarantee that
       an Id-filtered query returns items in the same order as the Id list. */
    return unique
        .map(id => validById.get(id))
        .filter((item): item is ItemDto => Boolean(item));
};

const shuffledCopy = <T,>(
    items: T[]
) => {
    const result = [ ...items ];

    for (
        let index =
            result.length - 1;
        index > 0;
        index -= 1
    ) {
        const swapIndex =
            Math.floor(
                Math.random()
                * (index + 1)
            );

        [
            result[index],
            result[swapIndex]
        ] = [
            result[swapIndex],
            result[index]
        ];
    }

    return result;
};

export const getMinitigerQuickBannerSample = async (
    apiClient: ApiClient,
    maxItems = MINITIGER_BANNER_LIMIT
): Promise<{
    items: ItemDto[];
    source: 'random';
}> => {
    const userId =
        apiClient.getCurrentUserId();

    if (!userId) {
        return {
            items: [],
            source: 'random'
        };
    }

    /* Server-side SortBy=Random becomes surprisingly expensive on large
       libraries (especially on a Pi). Fetch a modest indexed slice and do
       the randomization in the client instead. */
    const result =
        await apiClient.getItems(
            userId,
            {
                Recursive: true,
                Limit: 80,
                Fields: [
                    'Overview',
                    'DateCreated',
                    'PrimaryImageAspectRatio',
                    'MediaSourceCount',
                    'LocalTrailerCount',
                    'RemoteTrailers'
                ].join(','),
                ImageTypeLimit: 3,
                EnableImageTypes:
                    'Primary,Backdrop,Logo',
                EnableTotalRecordCount: false,
                IncludeItemTypes:
                    'Movie,Series',
                SortBy: 'DateCreated',
                SortOrder: 'Descending'
            }
        );

    const usableItems = (
        (result?.Items ?? []) as ItemDto[]
    ).filter(item => Boolean(
        item.Id
        && (
            item.BackdropImageTags?.length
            || item.ImageTags?.Primary
        )
    ));

    const shuffled =
        shuffledCopy(usableItems);

    return {
        items:
            maxItems > 0
                ? shuffled.slice(
                    0,
                    maxItems
                )
                : shuffled,
        source: 'random'
    };
};

export const getMinitigerBannerSample = async (
    apiClient: ApiClient,
    options: MinitigerBannerSampleOptions = {}
): Promise<{
    items: ItemDto[];
    playlistId?: string;
    playlistName?: string;
    source: 'playlist' | 'random';
}> => {
    const userId =
        apiClient.getCurrentUserId();

    if (!userId) {
        return {
            items: [],
            source: 'random'
        };
    }

    const maxItems =
        typeof options.maxItems === 'number'
        && Number.isFinite(options.maxItems)
            ? Math.max(
                0,
                Math.round(
                    options.maxItems
                    ?? MINITIGER_BANNER_LIMIT
                )
            )
            : MINITIGER_BANNER_LIMIT;

    const [
        playlist,
        storedSeriesIds,
        globalIds
    ] = await Promise.all([
        findMinitigerBannerPlaylist(
            apiClient
        ),
        getMinitigerBannerSeriesIds(
            apiClient
        ),
        getMinitigerGlobalBannerItemIds(
            apiClient
        )
    ]);

    let playlistIds: string[] = [];

    if (playlist?.Id) {
        playlistIds =
            (
                await getPlaylistCuratedIds(
                    apiClient,
                    playlist.Id
                )
            ).ids;
    }

    /*
     * Once the admin-global list exists it is authoritative, including an
     * intentionally empty list.  Before migration, a real banner playlist is
     * authoritative and legacy Series IDs are only used when no playlist
     * exists. This prevents stale old Series preferences from resurrecting
     * entries the admin already removed.
     */
    const curatedIds =
        globalIds !== null
            ? globalIds
            : playlist?.Id
                ? playlistIds
                : storedSeriesIds;

    const hasCuratedSource =
        globalIds !== null
        || Boolean(playlist?.Id)
        || storedSeriesIds.length > 0;

    if (
        globalIds === null
        && hasCuratedSource
    ) {
        try {
            const currentUser =
                await apiClient.getCurrentUser();

            if (
                currentUser?.Policy
                    ?.IsAdministrator
            ) {
                await broadcastMinitigerServerPreference(
                    apiClient,
                    MINITIGER_BANNER_GLOBAL_IDS_PREF_KEY,
                    curatedIds
                );
            }
        } catch (error) {
            console.debug(
                '[Minitiger Banner] Globale Banner-Migration wird später erneut versucht.',
                error
            );
        }
    }

    if (hasCuratedSource) {
        /*
         * Resolving every curated ID into a rich DTO is the expensive part of
         * banner startup.  When the user only wants e.g. 10 rotating entries,
         * sample a slightly larger ID pool first so items without artwork can
         * be discarded without querying hundreds of unused entries.
         */
        const idsToResolve =
            maxItems > 0
                ? shuffledCopy(curatedIds).slice(
                    0,
                    Math.min(
                        curatedIds.length,
                        Math.max(
                            maxItems * 3,
                            maxItems
                        )
                    )
                )
                : curatedIds;

        const curatedItems =
            await getBannerItemsByIds(
                apiClient,
                idsToResolve
            );

        const usableItems =
            shuffledCopy(
                curatedItems.filter(item => Boolean(
                    item.Id
                    && (
                        item.BackdropImageTags?.length
                        || item.ImageTags?.Primary
                    )
                ))
            );

        return {
            items:
                maxItems > 0
                    ? usableItems.slice(
                        0,
                        maxItems
                    )
                    : usableItems,
            playlistId:
                playlist?.Id
                ?? undefined,
            playlistName:
                playlist?.Name
                ?? 'Minitiger Banner',
            source: 'playlist'
        };
    }

    return getMinitigerQuickBannerSample(
        apiClient,
        maxItems
    );
};

export const getMinitigerBannerMembership = async (
    apiClient: ApiClient,
    itemId: string,
    itemType?: string | null
) => {
    const isSeries =
        String(
            itemType
            ?? ''
        ).toLowerCase() === 'series';

    const [
        playlist,
        storedSeriesIds,
        globalIds
    ] = await Promise.all([
        findMinitigerBannerPlaylist(
            apiClient
        ),
        isSeries
            ? getMinitigerBannerSeriesIds(
                apiClient
            )
            : Promise.resolve([]),
        getMinitigerGlobalBannerItemIds(
            apiClient
        )
    ]);

    let matchingEntries: PlaylistItemDto[] = [];

    if (playlist?.Id) {
        const page =
            await getPlaylistPage(
                apiClient,
                playlist.Id,
                0,
                MINITIGER_BANNER_PLAYLIST_SCAN_LIMIT,
                false,
                false
            );

        matchingEntries =
            (page.Items as PlaylistItemDto[])
                .filter(item => {
                    if (item.Id === itemId) {
                        return true;
                    }

                    return Boolean(
                        isSeries
                        && item.SeriesId === itemId
                    );
                });
    }

    const entryIds = uniqueIds(
        matchingEntries.map(item =>
            item.PlaylistItemId
            ?? item.Id
        )
    );

    const stored =
        isSeries
        && storedSeriesIds.includes(
            itemId
        );

    const globalConfigured =
        globalIds !== null;

    return {
        playlistId:
            playlist?.Id
            ?? undefined,
        inBanner:
            globalConfigured
                ? globalIds.includes(
                    itemId
                )
                : (
                    stored
                    || matchingEntries.length > 0
                ),
        entryId:
            entryIds[0]
            ?? undefined,
        entryIds,
        storedSeries: stored,
        globalConfigured
    };
};

export const addSeriesToMinitigerBanner = async (
    apiClient: ApiClient,
    seriesId: string
) => {
    const userId =
        apiClient.getCurrentUserId();

    if (!userId) {
        throw new Error(
            'Kein Jellyfin-Benutzer angemeldet.'
        );
    }

    /* A Series is a Folder in Jellyfin playlist semantics and would expand
       into every episode.  One episode is enough as a durable marker because
       playlist items expose SeriesId and Minitiger resolves that back to the
       top-level Series for the hero. */
    const result = await apiClient.getItems(
        userId,
        {
            ParentId: seriesId,
            Recursive: true,
            IncludeItemTypes: 'Episode',
            Limit: 100,
            Fields: 'SeriesId,LocationType',
            EnableTotalRecordCount: false,
            SortBy: 'ParentIndexNumber,IndexNumber',
            SortOrder: 'Ascending'
        }
    );

    const markerEpisode =
        ((result?.Items ?? []) as ItemDto[])
            .find(candidate => {
                const extended = candidate as ItemDto & {
                    LocationType?: string | null;
                    IsVirtualItem?: boolean | null;
                };

                return Boolean(
                    candidate.Id
                    && String(
                        extended.LocationType
                        ?? ''
                    ).toLowerCase() !== 'virtual'
                    && !extended.IsVirtualItem
                );
            });

    if (!markerEpisode?.Id) {
        throw new Error(
            'Für diese Serie wurde keine Episode gefunden, die als Banner-Marker verwendet werden kann.'
        );
    }

    return addItemToMinitigerBanner(
        apiClient,
        markerEpisode.Id
    );
};

export const addItemToMinitigerBanner = async (
    apiClient: ApiClient,
    itemId: string
) => {
    const userId =
        apiClient.getCurrentUserId();

    if (!userId) {
        throw new Error(
            'Kein Jellyfin-Benutzer angemeldet.'
        );
    }

    let playlist =
        await findMinitigerBannerPlaylist(
            apiClient
        );

    if (!playlist?.Id) {
        const created =
            await request<PlaylistCreationResult>(
                apiClient,
                'Playlists',
                'POST',
                {
                    Name:
                        'Minitiger Banner',
                    Ids: itemId,
                    UserId: userId
                }
            );

        const newId =
            created?.Id
            ?? created?.id;

        if (!newId) {
            throw new Error(
                'Minitiger Banner Playlist konnte nicht erstellt werden.'
            );
        }

        return newId;
    }

    await request(
        apiClient,
        `Playlists/${playlist.Id}/Items`,
        'POST',
        {
            Ids: itemId,
            UserId: userId
        }
    );

    return playlist.Id;
};

export const removeItemFromMinitigerBanner = async (
    apiClient: ApiClient,
    playlistId: string,
    entryIds: string | string[]
) => {
    const normalized = uniqueIds(
        Array.isArray(entryIds)
            ? entryIds
            : [ entryIds ]
    );

    if (!normalized.length) {
        return;
    }

    await request(
        apiClient,
        `Playlists/${playlistId}/Items`,
        'DELETE',
        {
            EntryIds: normalized.join(',')
        }
    );
};
