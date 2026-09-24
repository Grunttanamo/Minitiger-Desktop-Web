import { useQuery } from '@tanstack/react-query';
import type { ApiClient } from 'jellyfin-apiclient';
import React, { useEffect, useMemo } from 'react';

import type { ItemDto } from 'types/base/models/item-dto';

import type {
    MinitigerCustomRow
} from '../config/customRows';
import MinitigerMediaRow from './MinitigerMediaRow';

interface MinitigerCustomRowProps {
    row: MinitigerCustomRow;
    libraries: ItemDto[];
    apiClient?: ApiClient;
    loadAudioFlags?: boolean;
    showFskBadges?: boolean;
    showPlayedIndicators?: boolean;
    showVirtualAssign?: boolean;
    isVirtuallyAssigned?: (
        itemId?: string | null
    ) => boolean;
    onVirtualAssign?: (item: ItemDto) => void;
}

interface ItemQueryResult {
    Items?: ItemDto[];
}

interface MinitigerLatestSeasonItem extends ItemDto {
    __minitigerRecentEpisodeCount?: number;
    __minitigerLatestEpisodeTitle?: string;
    __minitigerLatestEpisodeIndex?: number | null;
    __minitigerLatestEpisodeSeasonIndex?: number | null;
}

interface MinitigerLatestSeasonHistoryEntry {
    episodeIds: string[];
    lastEventCount: number;
}

interface MinitigerLatestSeasonHistory {
    version: 1;
    seasons: Record<
        string,
        MinitigerLatestSeasonHistoryEntry
    >;
}

const LATEST_SEASON_HISTORY_VERSION = 1;
const LATEST_SEASON_HISTORY_EPISODE_LIMIT = 60;
const LATEST_SEASON_BOOTSTRAP_CREATED_GAP_MS =
    12 * 60 * 60 * 1000;
const LATEST_SEASON_BOOTSTRAP_CREATED_FUZZ_MS =
    10 * 60 * 1000;
const LATEST_SEASON_BOOTSTRAP_PREMIERE_GAP_MS =
    2 * 24 * 60 * 60 * 1000;
const LATEST_SEASON_BOOTSTRAP_RECENT_PREMIERE_MS =
    21 * 24 * 60 * 60 * 1000;

const CUSTOM_ROW_DATA_CACHE_VERSION = 1;
const CUSTOM_ROW_DATA_CACHE_TTL_MS =
    24 * 60 * 60 * 1000;
const CUSTOM_ROW_DATA_CACHE_PREFIX =
    'Minitiger.CustomRowData.v1';

const isMinitigerDesktopShell = () => (
    typeof window !== 'undefined'
    && Boolean(
        window.NativeShell
        || /QtWebEngine|Jellyfin(?:\\s+Desktop|MediaPlayer)/i.test(
            navigator.userAgent
        )
    )
);

interface MinitigerCustomRowDataCache {
    version: 1;
    savedAt: number;
    items: ItemDto[];
}

const getCustomRowDataCacheKey = (
    apiClient: ApiClient | undefined,
    userId: string,
    row: MinitigerCustomRow,
    slot: 'library1' | 'library2',
    libraryId?: string | null
) => [
    CUSTOM_ROW_DATA_CACHE_PREFIX,
    apiClient?.serverId() ?? 'server',
    userId || 'user',
    row.key,
    slot,
    libraryId ?? '',
    row.sortMode,
    row.count
].join(':');

const readCustomRowDataCache = (
    key: string
): ItemDto[] | undefined => {
    if (
        !isMinitigerDesktopShell()
        || !key
    ) {
        return undefined;
    }

    try {
        const raw =
            window.localStorage.getItem(key);

        if (!raw) {
            return undefined;
        }

        const parsed =
            JSON.parse(raw) as Partial<MinitigerCustomRowDataCache>;

        if (
            parsed.version
            !== CUSTOM_ROW_DATA_CACHE_VERSION
            || !Array.isArray(parsed.items)
            || typeof parsed.savedAt !== 'number'
            || Date.now() - parsed.savedAt
                > CUSTOM_ROW_DATA_CACHE_TTL_MS
        ) {
            window.localStorage.removeItem(key);
            return undefined;
        }

        return parsed.items;
    } catch {
        return undefined;
    }
};

const writeCustomRowDataCache = (
    key: string,
    items: ItemDto[]
) => {
    if (
        !isMinitigerDesktopShell()
        || !key
    ) {
        return;
    }

    try {
        const value: MinitigerCustomRowDataCache = {
            version: 1,
            savedAt: Date.now(),
            items
        };

        window.localStorage.setItem(
            key,
            JSON.stringify(value)
        );
    } catch (error) {
        console.warn(
            '[Minitiger CustomRow] Persistenter Zeilen-Cache konnte nicht gespeichert werden.',
            error
        );
    }
};

const getLatestSeasonHistoryKey = (
    userId: string,
    rowKey: string,
    libraryId: string
) => [
    'minitiger.latestSeasons.history.v1',
    userId,
    rowKey,
    libraryId
].join(':');

const readLatestSeasonHistory = (
    key: string
): MinitigerLatestSeasonHistory | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const raw =
            window.localStorage.getItem(key);

        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(
            raw
        ) as Partial<MinitigerLatestSeasonHistory>;

        if (
            parsed.version
            !== LATEST_SEASON_HISTORY_VERSION
            || !parsed.seasons
        ) {
            return null;
        }

        return parsed as MinitigerLatestSeasonHistory;
    } catch {
        return null;
    }
};

const writeLatestSeasonHistory = (
    key: string,
    history: MinitigerLatestSeasonHistory
) => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(
            key,
            JSON.stringify(history)
        );
    } catch {
        // Cosmetic history only; never break Home on storage errors.
    }
};

const inferBootstrapEventCount = (
    episodes: ItemDto[],
    now: number
) => {
    if (episodes.length <= 1) {
        return 1;
    }

    const latest = episodes[0];
    const previous = episodes[1];

    const latestCreated =
        Date.parse(latest.DateCreated ?? '')
        || 0;
    const previousCreated =
        Date.parse(previous.DateCreated ?? '')
        || 0;

    if (
        latestCreated > 0
        && previousCreated > 0
    ) {
        const createdGap =
            latestCreated - previousCreated;

        if (
            createdGap
            >= LATEST_SEASON_BOOTSTRAP_CREATED_GAP_MS
        ) {
            return 1;
        }

        if (
            createdGap
            > LATEST_SEASON_BOOTSTRAP_CREATED_FUZZ_MS
        ) {
            return 2;
        }
    }

    const latestPremiere =
        Date.parse(latest.PremiereDate ?? '')
        || 0;
    const previousPremiere =
        Date.parse(previous.PremiereDate ?? '')
        || 0;

    const premiereGap =
        latestPremiere - previousPremiere;

    const latestPremiereIsRecent =
        latestPremiere > 0
        && latestPremiere <= now
        && now - latestPremiere
            <= LATEST_SEASON_BOOTSTRAP_RECENT_PREMIERE_MS;

    if (
        latestPremiereIsRecent
        && previousPremiere > 0
        && premiereGap
            >= LATEST_SEASON_BOOTSTRAP_PREMIERE_GAP_MS
    ) {
        return 1;
    }

    return 2;
};

const getLibraryById = (
    libraries: ItemDto[],
    id: string
) => libraries.find(library => library.Id === id);

const getItemTypes = (
    collectionType: string,
    latestTitles: boolean,
    latestSeasons: boolean
) => {
    if (latestSeasons) {
        return collectionType.toLowerCase() === 'tvshows'
            ? 'Episode'
            : '';
    }

    switch (collectionType.toLowerCase()) {
        case 'tvshows':
            return latestTitles
                ? 'Series'
                : 'Episode';
        case 'movies':
            return 'Movie';
        case 'music':
            return latestTitles
                ? 'MusicAlbum'
                : 'Audio';
        case 'books':
            return latestTitles
                ? 'Folder,BoxSet'
                : 'Book';
        case 'musicvideos':
        case 'homevideos':
            return 'MusicVideo';
        default:
            return latestTitles
                ? 'Series,Movie,MusicAlbum,Folder,BoxSet,MusicVideo'
                : 'Episode,Movie,Audio,Book,MusicVideo';
    }
};

const fetchLibraryPart = async (
    apiClient: ApiClient,
    userId: string,
    library: ItemDto,
    row: MinitigerCustomRow
): Promise<ItemDto[]> => {
    if (!library.Id) {
        return [];
    }

    const latestTitles =
        row.sortMode === 'latestTitles';
    const latestSeasons =
        row.sortMode === 'latestSeasons';

    const collectionType =
        String(library.CollectionType ?? '');

    const itemTypes = getItemTypes(
        collectionType,
        latestTitles,
        latestSeasons
    );

    if (!itemTypes) {
        return [];
    }

    const wantsEpisodes =
        itemTypes.split(',').includes('Episode');

    const isMangaTitles =
        latestTitles
        && collectionType.toLowerCase() === 'books';

    const queryLimit = wantsEpisodes
        ? Math.min(
            500,
            Math.max(
                row.count * (latestSeasons ? 20 : 4),
                row.count + 30
            )
        )
        : Math.max(row.count, 12);

    const url = apiClient.getUrl(
        `Users/${userId}/Items`,
        {
            ParentId: library.Id,
            Recursive: !isMangaTitles,
            IncludeItemTypes: itemTypes,
            ExcludeLocationTypes:
                wantsEpisodes
                    ? 'Virtual'
                    : undefined,
            Fields:
                'PrimaryImageAspectRatio,DateCreated,Overview,MediaStreams,MediaSources,ParentId,SeriesId,SeriesName,ParentIndexNumber',
            EnableImageTypes:
                'Primary,Thumb,Backdrop',
            SortBy: 'DateCreated',
            SortOrder: 'Descending',
            Limit: queryLimit,
            EnableTotalRecordCount: false
        }
    );

    const result = await apiClient.getJSON(
        url
    ) as ItemQueryResult;

    const now = Date.now();

    const filtered = (result.Items ?? []).filter(item => {
        if (!wantsEpisodes || !item.PremiereDate) {
            return true;
        }

        const timestamp =
            Date.parse(item.PremiereDate);

        return !Number.isFinite(timestamp)
            || timestamp <= now;
    });

    if (!latestSeasons) {
        return filtered;
    }

    const episodesBySeason =
        new Map<string, ItemDto[]>();

    filtered.forEach(episode => {
        const seasonId =
            String(episode.ParentId ?? '');

        if (!seasonId) {
            return;
        }

        const existing =
            episodesBySeason.get(
                seasonId
            );

        if (existing) {
            existing.push(episode);
            return;
        }

        episodesBySeason.set(
            seasonId,
            [ episode ]
        );
    });

    const historyKey =
        getLatestSeasonHistoryKey(
            userId,
            row.key,
            library.Id
        );

    const previousHistory =
        readLatestSeasonHistory(
            historyKey
        );

    const nextHistory:
        MinitigerLatestSeasonHistory = {
            version: 1,
            seasons: {}
        };

    const latestEpisodeBySeason =
        new Map<string, {
            latestEpisode: ItemDto;
            latestTimestamp: number;
            recentCount: number;
        }>();

    episodesBySeason.forEach(
        (episodes, seasonId) => {
            const latestEpisode =
                episodes[0];

            if (!latestEpisode) {
                return;
            }

            const currentEpisodeIds =
                episodes
                    .slice(
                        0,
                        LATEST_SEASON_HISTORY_EPISODE_LIMIT
                    )
                    .map(episode =>
                        String(
                            episode.Id ?? ''
                        )
                    )
                    .filter(Boolean);

            const previousEntry =
                previousHistory
                    ?.seasons[seasonId];

            let recentCount =
                inferBootstrapEventCount(
                    episodes,
                    now
                );

            if (
                previousEntry
                && previousEntry.episodeIds.length > 0
            ) {
                const previousIds =
                    new Set(
                        previousEntry.episodeIds
                    );

                const newEpisodeCount =
                    currentEpisodeIds.filter(
                        episodeId =>
                            !previousIds.has(
                                episodeId
                            )
                    ).length;

                recentCount =
                    newEpisodeCount > 0
                        ? newEpisodeCount
                        : Math.max(
                            1,
                            previousEntry.lastEventCount
                        );
            }

            nextHistory.seasons[seasonId] = {
                episodeIds:
                    currentEpisodeIds,
                lastEventCount:
                    recentCount
            };

            latestEpisodeBySeason.set(
                seasonId,
                {
                    latestEpisode,
                    latestTimestamp:
                        Date.parse(
                            latestEpisode.DateCreated
                            ?? ''
                        ) || 0,
                    recentCount
                }
            );
        }
    );

    writeLatestSeasonHistory(
        historyKey,
        nextHistory
    );

    const seasonIds = Array.from(
        latestEpisodeBySeason.keys()
    ).slice(0, row.count);

    const seasons = await Promise.all(
        seasonIds.map(async seasonId => {
            try {
                const season = await apiClient.getItem(
                    userId,
                    seasonId
                ) as ItemDto;
                const seasonActivity =
                    latestEpisodeBySeason.get(
                        seasonId
                    );

                if (!seasonActivity) {
                    return season;
                }

                const latestEpisode =
                    seasonActivity.latestEpisode;

                return {
                    ...season,
                    DateCreated:
                        latestEpisode.DateCreated
                        ?? season.DateCreated,
                    __minitigerRecentEpisodeCount:
                        seasonActivity.recentCount,
                    __minitigerLatestEpisodeTitle:
                        latestEpisode.Name
                        ?? '',
                    __minitigerLatestEpisodeIndex:
                        latestEpisode.IndexNumber,
                    __minitigerLatestEpisodeSeasonIndex:
                        latestEpisode.ParentIndexNumber
                        ?? season.IndexNumber
                } as MinitigerLatestSeasonItem;
            } catch {
                return null;
            }
        })
    );

    return seasons.filter(
        (season): season is ItemDto =>
            Boolean(season)
    );
};

const byDateCreatedDesc = (
    left: ItemDto,
    right: ItemDto
) => {
    const leftValue = Date.parse(
        left.DateCreated ?? ''
    ) || 0;

    const rightValue = Date.parse(
        right.DateCreated ?? ''
    ) || 0;

    return rightValue - leftValue;
};

const uniqueById = (
    items: ItemDto[]
) => {
    const seen = new Set<string>();

    return items.filter(item => {
        const key = item.Id
            ?? `${item.Type ?? ''}:${item.Name ?? ''}`;

        if (seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
};

const formatEpisodeNumber = (
    value?: number | null
) => (
    value == null
        ? ''
        : String(value).padStart(2, '0')
);

const getLatestSeasonSubtitle = (
    item: ItemDto
) => {
    const seasonItem =
        item as MinitigerLatestSeasonItem;

    if (
        seasonItem
            .__minitigerRecentEpisodeCount
        !== 1
    ) {
        return undefined;
    }

    const seasonNumber =
        seasonItem
            .__minitigerLatestEpisodeSeasonIndex
        ?? item.IndexNumber;

    const episodeNumber =
        seasonItem
            .__minitigerLatestEpisodeIndex;

    const episodeTitle =
        String(
            seasonItem
                .__minitigerLatestEpisodeTitle
            ?? ''
        ).trim();

    const seasonLabel =
        formatEpisodeNumber(
            seasonNumber
        );
    const episodeLabel =
        formatEpisodeNumber(
            episodeNumber
        );

    const code = (
        seasonLabel
        && episodeLabel
    )
        ? `S${seasonLabel}E${episodeLabel}`
        : episodeLabel
            ? `E${episodeLabel}`
            : '';

    return [
        code,
        episodeTitle
    ]
        .filter(Boolean)
        .join(' - ')
        || undefined;
};

const MinitigerCustomRow = ({
    row,
    libraries,
    apiClient,
    loadAudioFlags = false,
    showFskBadges = true,
    showPlayedIndicators = true,
    showVirtualAssign = false,
    isVirtuallyAssigned,
    onVirtualAssign
}: MinitigerCustomRowProps) => {
    const userId =
        apiClient?.getCurrentUserId() ?? '';

    const firstLibrary = getLibraryById(
        libraries,
        row.library1
    );

    const secondLibrary = getLibraryById(
        libraries,
        row.library2
    );

    const firstEnabled = Boolean(
        apiClient
        && userId
        && firstLibrary?.Id
    );

    const secondEnabled = Boolean(
        apiClient
        && userId
        && secondLibrary?.Id
        && secondLibrary?.Id !== firstLibrary?.Id
    );

    const firstCacheKey = useMemo(
        () => getCustomRowDataCacheKey(
            apiClient,
            userId,
            row,
            'library1',
            firstLibrary?.Id
        ),
        [
            apiClient,
            firstLibrary?.Id,
            row,
            userId
        ]
    );

    const secondCacheKey = useMemo(
        () => getCustomRowDataCacheKey(
            apiClient,
            userId,
            row,
            'library2',
            secondLibrary?.Id
        ),
        [
            apiClient,
            row,
            secondLibrary?.Id,
            userId
        ]
    );

    const firstInitialData = useMemo(
        () => firstEnabled
            ? readCustomRowDataCache(
                firstCacheKey
            )
            : undefined,
        [
            firstCacheKey,
            firstEnabled
        ]
    );

    const secondInitialData = useMemo(
        () => secondEnabled
            ? readCustomRowDataCache(
                secondCacheKey
            )
            : undefined,
        [
            secondCacheKey,
            secondEnabled
        ]
    );

    const firstQuery = useQuery({
        queryKey: [
            'Minitiger',
            'CustomRow',
            row.key,
            'library1',
            firstLibrary?.Id ?? '',
            row.sortMode,
            row.count
        ],
        queryFn: () => fetchLibraryPart(
            apiClient!,
            userId,
            firstLibrary!,
            row
        ),
        enabled: firstEnabled,
        initialData: firstInitialData,
        initialDataUpdatedAt:
            firstInitialData
                ? 0
                : undefined
    });

    const secondQuery = useQuery({
        queryKey: [
            'Minitiger',
            'CustomRow',
            row.key,
            'library2',
            secondLibrary?.Id ?? '',
            row.sortMode,
            row.count
        ],
        queryFn: () => fetchLibraryPart(
            apiClient!,
            userId,
            secondLibrary!,
            row
        ),
        enabled: secondEnabled,
        initialData: secondInitialData,
        initialDataUpdatedAt:
            secondInitialData
                ? 0
                : undefined
    });

    useEffect(() => {
        if (
            firstEnabled
            && firstQuery.data
            && firstQuery.dataUpdatedAt > 0
        ) {
            writeCustomRowDataCache(
                firstCacheKey,
                firstQuery.data
            );
        }
    }, [
        firstCacheKey,
        firstEnabled,
        firstQuery.data,
        firstQuery.dataUpdatedAt
    ]);

    useEffect(() => {
        if (
            secondEnabled
            && secondQuery.data
            && secondQuery.dataUpdatedAt > 0
        ) {
            writeCustomRowDataCache(
                secondCacheKey,
                secondQuery.data
            );
        }
    }, [
        secondCacheKey,
        secondEnabled,
        secondQuery.data,
        secondQuery.dataUpdatedAt
    ]);

    const items = useMemo(
        () => uniqueById([
            ...(firstQuery.data ?? []),
            ...(secondQuery.data ?? [])
        ])
            .sort(byDateCreatedDesc)
            .slice(0, row.count),
        [
            firstQuery.data,
            row.count,
            secondQuery.data
        ]
    );

    if (!row.library1 && !row.library2) {
        return null;
    }

    const primaryCollectionType = String(
        firstLibrary?.CollectionType
        ?? secondLibrary?.CollectionType
        ?? ''
    ).toLowerCase();

    const effectiveDisplay:
        'poster' | 'landscape' | 'square' =
        row.sortMode === 'latestSeasons'
            ? 'poster'
            : primaryCollectionType === 'music'
                ? 'square'
                : primaryCollectionType === 'musicvideos'
                    ? 'landscape'
                    : row.display;

    return (
        <MinitigerMediaRow
            title={row.title}
            items={items}
            apiClient={apiClient}
            pending={
                (
                    firstEnabled
                    && firstQuery.isPending
                )
                || (
                    secondEnabled
                    && secondQuery.isPending
                )
            }
            error={
                (
                    firstEnabled
                    && firstQuery.isError
                )
                || (
                    secondEnabled
                    && secondQuery.isError
                )
            }
            variant={effectiveDisplay}
            cardScale={row.cardScale}
            cardGap={row.gap}
            showTitle={row.showTitle}
            preferParentLandscape={
                effectiveDisplay === 'landscape'
            }
            loadAudioFlags={loadAudioFlags}
            showFskBadges={showFskBadges}
            showPlayedIndicators={showPlayedIndicators}
            showVirtualAssign={showVirtualAssign}
            isVirtuallyAssigned={
                isVirtuallyAssigned
            }
            onVirtualAssign={
                onVirtualAssign
            }
            previewContext={primaryCollectionType}
            subtitleOverride={
                row.sortMode === 'latestSeasons'
                    ? getLatestSeasonSubtitle
                    : undefined
            }
            emptyText='Für diese Custom-Reihe wurden noch keine passenden Inhalte gefunden.'
        />
    );
};

export default MinitigerCustomRow;

// MINITIGER_PATCH_MARKER: PHASE_18_18_0_LATEST_SEASONS_RENDER

// MINITIGER_PATCH_MARKER: PHASE_18_18_5C_PERSISTENT_LATEST_SEASON_HISTORY
