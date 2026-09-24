import { useQuery } from '@tanstack/react-query';
import React, {
    useEffect,
    useMemo,
    useState
} from 'react';
import { Link } from 'react-router-dom';

import { clearBackdrop } from 'components/backdrop/backdrop';
import Page from 'components/Page';
import { playbackManager } from 'components/playback/playbackmanager';
import { useApi } from 'hooks/useApi';
import {
    useToggleFavoriteMutation,
    useTogglePlayedMutation
} from 'hooks/useFetchItems';
import { useItem } from 'hooks/useItem';
import type { ItemDto } from 'types/base/models/item-dto';

import useMinitigerDetailSettings from '../home/hooks/useMinitigerDetailSettings';
import useMinitigerHomeSettings from '../home/hooks/useMinitigerHomeSettings';
import useMinitigerThemeVariables from '../home/hooks/useMinitigerThemeVariables';
import {
    getBackdropImageUrl,
    getPrimaryImageUrl
} from '../home/mediaUtils';
import { getItemRoute } from '../home/routingUtils';

import MinitigerItemMenuButton from './MinitigerItemMenuButton';
import MinitigerDirectoryUpdateButton from './MinitigerDirectoryUpdateButton';

import './MinitigerVideoDetails.scss';

interface Props {
    itemId: string;
}


interface VirtualFolderRootInfo {
    ItemId?: string;
    Locations?: string[];
}

const normalizeLibraryPath = (
    value?: string | null
) => String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');

const getVolumeNumber = (
    item: ItemDto
) => {
    if (
        item.IndexNumber
        != null
    ) {
        return Number(
            item.IndexNumber
        );
    }

    const match =
        String(
            item.Name
            ?? ''
        ).match(
            /(\d{1,3})\s*$/
        );

    return match
        ? Number(
            match[1]
        )
        : null;
};

const getVisibleMangaVolumeIdentity = (
    value?: ItemDto
) => {
    const name =
        String(
            value?.Name
            ?? ''
        ).trim();

    const match = name.match(
        /^(.*?)(?:\s+(?:band|bd\.?|vol(?:ume)?\.?)\s*)?0*(\d{1,3})\s*$/i
    );

    if (
        !match
        || !match[1]
        || !match[2]
    ) {
        return null;
    }

    return {
        stem: match[1]
            .trim()
            .toLocaleLowerCase()
            .replace(/\s+/g, ' '),
        number: Number(match[2])
    };
};

const isOtherVolumeOfSameVisibleSeries = (
    current: ItemDto,
    candidate: ItemDto
) => {
    const currentIdentity =
        getVisibleMangaVolumeIdentity(
            current
        );

    const candidateIdentity =
        getVisibleMangaVolumeIdentity(
            candidate
        );

    if (
        !currentIdentity
        || !candidateIdentity
        || currentIdentity.stem
            !== candidateIdentity.stem
    ) {
        return false;
    }

    return candidateIdentity.number
        !== currentIdentity.number;
};


const sortVolumes = (
    values: ItemDto[]
) => (
    [ ...values ]
        .sort(
            (
                left,
                right
            ) => {
                const a =
                    getVolumeNumber(
                        left
                    );

                const b =
                    getVolumeNumber(
                        right
                    );

                if (
                    a != null
                    && b != null
                    && a !== b
                ) {
                    return a - b;
                }

                return String(
                    left.SortName
                    ?? left.Name
                    ?? ''
                ).localeCompare(
                    String(
                        right.SortName
                        ?? right.Name
                        ?? ''
                    ),
                    undefined,
                    {
                        numeric: true
                    }
                );
            }
        )
);

const MangaShell = ({
    children,
    backdrop,
    detailSettings
}: React.PropsWithChildren<{
    backdrop?: string;
    detailSettings: ReturnType<
        typeof useMinitigerDetailSettings
    >['settings'];
}>) => {
    const style = {
        '--mt-details-poster-width':
            `${detailSettings.mangaPosterWidth}px`,
        '--mt-details-season-width':
            `${detailSettings.mangaVolumeWidth}px`,
        '--mt-details-content-width':
            `${detailSettings.contentWidth}px`,
        '--mt-details-cast-width':
            `${detailSettings.castWidth}px`
    } as React.CSSProperties;

    return (
        <Page
            id='minitigerMangaDetailsPage'
            className='mainAnimatedPage minitigerVideoDetailsPage minitigerMangaDetailsPage'
            isBackButtonEnabled
            style={style}
        >
            <div
                className='minitigerDetailsBackdrop'
                style={
                    backdrop
                        ? {
                            backgroundImage:
                                `url("${backdrop}")`
                        }
                        : undefined
                }
            />
            <div className='minitigerDetailsShade' />
            <main className='minitigerDetailsSurface'>
                {children}
            </main>
        </Page>
    );
};

const MangaVolumeCards = ({
    volumes,
    apiClient,
    isAdmin
}: {
    volumes: ItemDto[];
    apiClient:
        ReturnType<typeof useApi>[
            '__legacyApiClient__'
        ];
    isAdmin: boolean;
}) => (
    <div
        className='minitigerMangaVolumeGrid'
        aria-label='Manga-Bände'
    >
        {volumes.map(volume => {
            const poster =
                getPrimaryImageUrl(
                    apiClient,
                    volume
                );

            return (
                <Link
                    key={
                        volume.Id
                        ?? volume.Name
                    }
                    to={getItemRoute(volume)}
                    className='minitigerMangaVolumeCard'
                >
                    <div>
                        {isAdmin && (
                            <MinitigerItemMenuButton
                                apiClient={apiClient}
                                item={volume}
                                title='Band-Menü'
                                allowDelete={false}
                            />
                        )}

                        {poster ? (
                            <img
                                src={poster}
                                alt=''
                            />
                        ) : (
                            <span>
                                Kein Cover
                            </span>
                        )}
                    </div>

                    <strong>
                        {
                            volume.Name
                            ?? 'Band'
                        }
                    </strong>
                </Link>
            );
        })}
    </div>
);

export const MinitigerMangaSeriesDetails = ({
    itemId
}: Props) => {
    const {
        user,
        __legacyApiClient__: apiClient
    } = useApi();

    const {
        settings: homeSettings
    } = useMinitigerHomeSettings();

    const {
        settings: detailSettings
    } = useMinitigerDetailSettings();

    useMinitigerThemeVariables(
        homeSettings
    );

    const {
        data,
        isPending
    } = useItem(itemId);

    const item =
        data as
            ItemDto
            | undefined;

    const userId =
        apiClient?.getCurrentUserId()
        ?? '';

    const isAdmin =
        Boolean(
            user?.Policy?.IsAdministrator
        );

    const volumesQuery = useQuery({
        queryKey: [
            'Minitiger',
            'MangaSeries',
            userId,
            itemId
        ],
        queryFn: async () => {
            if (
                !apiClient
                || !userId
            ) {
                return [] as ItemDto[];
            }

            const result =
                await apiClient.getItems(
                    userId,
                    {
                        ParentId:
                            itemId,
                        IncludeItemTypes:
                            'Book',
                        Recursive: true,
                        SortBy:
                            'SortName',
                        SortOrder:
                            'Ascending',
                        Limit: 2000,
                        Fields:
                            'Overview,IndexNumber,SortName,ProductionYear',
                        EnableTotalRecordCount:
                            false
                    }
                );

            return sortVolumes(
                (
                    result?.Items
                    ?? []
                ) as ItemDto[]
            );
        },
        enabled: Boolean(
            apiClient
            && userId
            && itemId
        ),
        staleTime:
            10 * 60_000
    });

    useEffect(() => {
        clearBackdrop();
    }, []);

    if (
        isPending
        || !item
    ) {
        return (
            <Page
                id='minitigerMangaSeriesLoading'
                className='mainAnimatedPage minitigerVideoDetailsPage'
                isBackButtonEnabled
            >
                <div className='minitigerDetailsLoading'>
                    Manga wird geladen …
                </div>
            </Page>
        );
    }

    const volumes =
        volumesQuery.data
        ?? [];

    const poster =
        getPrimaryImageUrl(
            apiClient,
            item
        )
        ?? (
            volumes[0]
                ? getPrimaryImageUrl(
                    apiClient,
                    volumes[0]
                )
                : undefined
        );

    const backdrop =
        getBackdropImageUrl(
            apiClient,
            item
        )
        ?? poster;

    const publishers = (item.Studios ?? [])
        .map(studio => studio.Name)
        .filter((name): name is string => Boolean(name));

    return (
        <MangaShell
            backdrop={backdrop}
            detailSettings={detailSettings}
        >
            <section className='minitigerDetailsHero'>
                <div className='minitigerDetailsPoster'>
                    {poster ? (
                        <img
                            src={poster}
                            alt=''
                        />
                    ) : (
                        <div className='minitigerDetailsPosterFallback'>
                            📚
                        </div>
                    )}
                </div>

                <div className='minitigerDetailsInfo'>
                    <div className='minitigerDetailsType'>
                        MANGA
                    </div>

                    <h1>
                        {
                            item.Name
                            ?? 'Manga'
                        }
                    </h1>

                    <div className='minitigerDetailsMeta'>
                        <span>
                            {
                                volumes.length
                            } Bände
                        </span>
                    </div>

                    {publishers.length > 0 && (
                        <div className='minitigerDetailsExtraMeta isPublisher'>
                            <div>
                                <strong>Verlag</strong>
                                <span>{publishers.join(' · ')}</span>
                            </div>
                        </div>
                    )}

                    <p className='minitigerDetailsOverview'>
                        {
                            item.Overview
                            || 'Für diese Manga-Reihe ist derzeit keine Beschreibung hinterlegt.'
                        }
                    </p>

                    <div className='minitigerDetailsActions'>
                        {isAdmin
                            && detailSettings.directoryUpdateButtonEnabled
                            && (
                                <MinitigerDirectoryUpdateButton
                                    apiClient={apiClient}
                                    itemId={item.Id}
                                />
                            )}

                        {isAdmin && (
                            <MinitigerItemMenuButton
                                apiClient={apiClient}
                                item={item}
                                placement='action'
                                title='Manga-Menü'
                            />
                        )}
                    </div>
                </div>
            </section>

            <section className='minitigerDetailsSection'>
                <div className='minitigerDetailsSectionHead'>
                    <div>
                        <h2>Bände</h2>
                        <span>
                            {volumes.length}
                        </span>
                    </div>
                </div>

                <MangaVolumeCards
                    volumes={volumes}
                    apiClient={apiClient}
                    isAdmin={isAdmin}
                />
            </section>
        </MangaShell>
    );
};

export const MinitigerMangaVolumeDetails = ({
    itemId
}: Props) => {
    const {
        user,
        __legacyApiClient__: apiClient
    } = useApi();

    const {
        settings: homeSettings
    } = useMinitigerHomeSettings();

    const {
        settings: detailSettings
    } = useMinitigerDetailSettings();

    useMinitigerThemeVariables(
        homeSettings
    );

    const {
        data,
        isPending
    } = useItem(itemId);

    const item =
        data as
            ItemDto
            | undefined;

    const {
        data: parentData
    } = useItem(
        item?.ParentId
        ?? undefined
    );

    const parent =
        parentData as
            ItemDto
            | undefined;

    const parentType =
        String(parent?.Type ?? '').toLowerCase();

    const parentCollectionType =
        String(parent?.CollectionType ?? '').toLowerCase();

    const parentLooksLikeLibraryRoot =
        parentType === 'collectionfolder'
        || parentType === 'userview'
        || parentType === 'aggregatefolder'
        || Boolean(parentCollectionType);

    /* Jellyfin exposes BaseItemDto.ParentId as DisplayParentId. For normal
       users a standalone Book can therefore point directly at the visible
       UserView rather than at the physical CollectionFolder. UserView and
       AggregateFolder are library roots, never manga-series folders. */

    const userId =
        apiClient?.getCurrentUserId()
        ?? '';

    const isAdmin =
        Boolean(
            user?.Policy?.IsAdministrator
        );

    const siblingVolumesQuery = useQuery({
        queryKey: [
            'Minitiger',
            'MangaVolumeSiblings',
            'deterministic-j2',
            userId,
            item?.ParentId ?? '',
            itemId
        ],
        queryFn: async () => {
            if (
                !apiClient
                || !userId
                || !item?.ParentId
                || !parent
                || parentLooksLikeLibraryRoot
            ) {
                return [] as ItemDto[];
            }

            /* Normal users cannot rely on Jellyfin's admin-only
               virtual-folder endpoint. Their own UserViews are the
               permission-safe source for visible library roots. If the
               current parent is one of those roots, this is a standalone
               volume and every other book in that library must NOT appear
               under "Weitere Bände". */
            try {
                const userViews =
                    await apiClient.getUserViews(
                        {},
                        userId
                    );

                const visibleViews =
                    (
                        userViews?.Items
                        ?? []
                    ) as ItemDto[];

                const parentId =
                    String(
                        parent.Id
                        ?? item.ParentId
                        ?? ''
                    );

                const parentName =
                    String(
                        parent.Name
                        ?? ''
                    ).trim().toLocaleLowerCase();

                const parentPath =
                    normalizeLibraryPath(
                        parent.Path
                    );

                const matchesParentRoot = (
                    candidate?: ItemDto | null
                ) => {
                    if (!candidate) {
                        return false;
                    }

                    const candidateId =
                        String(
                            candidate.Id
                            ?? ''
                        );

                    const candidateName =
                        String(
                            candidate.Name
                            ?? ''
                        ).trim().toLocaleLowerCase();

                    const candidatePath =
                        normalizeLibraryPath(
                            candidate.Path
                        );

                    return (
                        Boolean(parentId)
                        && candidateId === parentId
                    ) || (
                        Boolean(parentPath)
                        && Boolean(candidatePath)
                        && candidatePath === parentPath
                    ) || (
                        Boolean(parentName)
                        && Boolean(candidateName)
                        && candidateName === parentName
                        && (
                            String(
                                candidate.Type
                                ?? ''
                            ).toLowerCase()
                            === 'collectionfolder'
                            || Boolean(
                                candidate.CollectionType
                            )
                        )
                    );
                };

                /* Jellyfin may expose a user's library View with an ID that is
                   different from the physical Folder used as Book.ParentId.
                   First compare the lightweight UserViews response by ID,
                   path and library name/type. */
                if (
                    visibleViews.some(
                        matchesParentRoot
                    )
                ) {
                    return [] as ItemDto[];
                }

                /* Some servers omit Path/CollectionType from UserViews.
                   Resolve the user's visible library items themselves and
                   compare again. This endpoint is usable by the logged-in
                   user and avoids the admin-only VirtualFolders API. */
                const detailedViews =
                    await Promise.allSettled(
                        visibleViews
                            .filter(view =>
                                Boolean(
                                    view.Id
                                )
                            )
                            .map(view =>
                                apiClient.getItem(
                                    userId,
                                    view.Id ?? ''
                                ) as Promise<ItemDto>
                            )
                    );

                const parentIsResolvedUserLibraryRoot =
                    detailedViews.some(result =>
                        result.status === 'fulfilled'
                        && matchesParentRoot(
                            result.value
                        )
                    );

                if (
                    parentIsResolvedUserLibraryRoot
                ) {
                    return [] as ItemDto[];
                }
            } catch {
                // Best effort; admins still get the stronger check below.
            }


            /* Jellyfin 12 does not always expose a physical Books/Comics
               library root as Type=CollectionFolder (or with CollectionType).
               Admins can additionally compare against configured virtual
               folders as a second root check. */
            const virtualFolderClient = apiClient as unknown as {
                getVirtualFolders?: () => Promise<VirtualFolderRootInfo[]>;
            };

            if (
                isAdmin
                && typeof virtualFolderClient.getVirtualFolders
                    === 'function'
            ) {
                try {
                    const virtualFolders =
                        await virtualFolderClient.getVirtualFolders();

                    const parentId =
                        String(parent.Id ?? '');

                    const parentPath =
                        normalizeLibraryPath(parent.Path);

                    const parentIsConfiguredLibraryRoot =
                        virtualFolders.some(folder => {
                            const sameItemId =
                                Boolean(parentId)
                                && String(folder.ItemId ?? '')
                                    === parentId;

                            const sameLocation =
                                Boolean(parentPath)
                                && (folder.Locations ?? [])
                                    .some(location =>
                                        normalizeLibraryPath(location)
                                        === parentPath
                                    );

                            return sameItemId || sameLocation;
                        });

                    if (parentIsConfiguredLibraryRoot) {
                        return [] as ItemDto[];
                    }
                } catch {
                    // Best effort: keep the existing hierarchy checks as fallback.
                }
            }

            const result = await apiClient.getItems(
                userId,
                {
                    ParentId: item.ParentId,
                    IncludeItemTypes: 'Book',
                    Recursive: true,
                    SortBy: 'SortName',
                    SortOrder: 'Ascending',
                    Limit: 2000,
                    Fields:
                        'Overview,IndexNumber,SortName,ProductionYear',
                    EnableTotalRecordCount: false
                }
            );

            const currentIdentity =
                getVisibleMangaVolumeIdentity(
                    item
                );

            if (!currentIdentity) {
                return [] as ItemDto[];
            }

            return sortVolumes(
                (result?.Items ?? []) as ItemDto[]
            ).filter(volume =>
                isOtherVolumeOfSameVisibleSeries(
                    item,
                    volume
                )
            );
        },
        enabled: Boolean(
            apiClient
            && userId
            && item?.ParentId
            && parent
            && !parentLooksLikeLibraryRoot
        ),
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: 'always'
    });

    const favoriteMutation =
        useToggleFavoriteMutation();

    const playedMutation =
        useTogglePlayedMutation();

    const [
        favorite,
        setFavorite
    ] = useState(false);

    const [
        played,
        setPlayed
    ] = useState(false);

    useEffect(() => {
        setFavorite(
            Boolean(
                item?.UserData
                    ?.IsFavorite
            )
        );
        setPlayed(
            Boolean(
                item?.UserData
                    ?.Played
            )
        );
    }, [
        item?.Id,
        item?.UserData
            ?.IsFavorite,
        item?.UserData
            ?.Played
    ]);

    useEffect(() => {
        clearBackdrop();
    }, []);

    if (
        isPending
        || !item
    ) {
        return (
            <Page
                id='minitigerMangaVolumeLoading'
                className='mainAnimatedPage minitigerVideoDetailsPage'
                isBackButtonEnabled
            >
                <div className='minitigerDetailsLoading'>
                    Manga-Band wird geladen …
                </div>
            </Page>
        );
    }

    const visibleSiblingVolumes =
        (
            siblingVolumesQuery.data
            ?? []
        ).filter(volume =>
            isOtherVolumeOfSameVisibleSeries(
                item,
                volume
            )
        );

    const poster =
        getPrimaryImageUrl(
            apiClient,
            item
        );

    const backdrop =
        getBackdropImageUrl(
            apiClient,
            parent
            ?? item
        )
        ?? poster;

    const volumeNumber =
        getVolumeNumber(
            item
        );

    const publishers = (item.Studios ?? [])
        .map(studio => studio.Name)
        .filter((name): name is string => Boolean(name));

    const read = () => {
        playbackManager.play({
            items: [ item ]
        }).catch(error => {
            console.error(
                '[Minitiger Manga] Lesen konnte nicht gestartet werden',
                error
            );
        });
    };

    const togglePlayed = async () => {
        if (
            !item.Id
            || playedMutation.isPending
        ) {
            return;
        }

        await playedMutation.mutateAsync({
            itemId:
                item.Id,
            isPlayed:
                played
        });

        setPlayed(
            !played
        );
    };

    const toggleFavorite = async () => {
        if (
            !item.Id
            || favoriteMutation.isPending
        ) {
            return;
        }

        await favoriteMutation.mutateAsync({
            itemId:
                item.Id,
            isFavorite:
                favorite
        });

        setFavorite(
            !favorite
        );
    };

    return (
        <MangaShell
            backdrop={backdrop}
            detailSettings={detailSettings}
        >
            <section className='minitigerDetailsHero'>
                <div className='minitigerDetailsPoster'>
                    {poster ? (
                        <img
                            src={poster}
                            alt=''
                        />
                    ) : (
                        <div className='minitigerDetailsPosterFallback'>
                            📚
                        </div>
                    )}
                </div>

                <div className='minitigerDetailsInfo'>
                    <div className='minitigerDetailsType'>
                        MANGA BAND
                    </div>

                    <h1>
                        {
                            item.Name
                            ?? 'Manga Band'
                        }
                    </h1>

                    <div className='minitigerDetailsMeta'>
                        {volumeNumber != null && (
                            <span>
                                Band {
                                    volumeNumber
                                }
                            </span>
                        )}

                        {item.ProductionYear && (
                            <span>
                                {
                                    item.ProductionYear
                                }
                            </span>
                        )}
                    </div>

                    {publishers.length > 0 && (
                        <div className='minitigerDetailsExtraMeta isPublisher'>
                            <div>
                                <strong>Verlag</strong>
                                <span>{publishers.join(' · ')}</span>
                            </div>
                        </div>
                    )}

                    <p className='minitigerDetailsOverview'>
                        {
                            item.Overview
                            || 'Für diesen Band ist derzeit keine Beschreibung hinterlegt.'
                        }
                    </p>

                    <div className='minitigerDetailsActions'>
                        <button
                            type='button'
                            className='isPrimary'
                            onClick={read}
                        >
                            ▶ Lesen
                        </button>

                        <button
                            type='button'
                            className={
                                played
                                    ? 'isActive'
                                    : ''
                            }
                            onClick={
                                togglePlayed
                            }
                        >
                            ✓
                        </button>

                        <button
                            type='button'
                            className={
                                favorite
                                    ? 'isActive'
                                    : ''
                            }
                            onClick={
                                toggleFavorite
                            }
                        >
                            {
                                favorite
                                    ? '♥'
                                    : '♡'
                            }
                        </button>

                        {isAdmin
                            && detailSettings.directoryUpdateButtonEnabled
                            && (
                                <MinitigerDirectoryUpdateButton
                                    apiClient={apiClient}
                                    itemId={item.Id}
                                />
                            )}

                        {isAdmin && (
                            <MinitigerItemMenuButton
                                apiClient={apiClient}
                                item={item}
                                placement='action'
                                title='Band-Menü'
                            />
                        )}
                    </div>
                </div>
            </section>

            {visibleSiblingVolumes.length > 0
                && (
                    <section className='minitigerDetailsSection'>
                        <div className='minitigerDetailsSectionHead'>
                            <div>
                                <h2>Weitere Bände</h2>
                                <span>
                                    {visibleSiblingVolumes.length} Bände
                                </span>
                            </div>
                        </div>

                        <MangaVolumeCards
                            volumes={visibleSiblingVolumes}
                            apiClient={apiClient}
                            isAdmin={isAdmin}
                        />
                    </section>
                )}

        </MangaShell>
    );
};
