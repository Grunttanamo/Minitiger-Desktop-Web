import { useQuery } from '@tanstack/react-query';
import React, {
    useEffect,
    useMemo
} from 'react';
import { Link } from 'react-router-dom';

import { clearBackdrop } from 'components/backdrop/backdrop';
import Page from 'components/Page';
import { playbackManager } from 'components/playback/playbackmanager';
import { useApi } from 'hooks/useApi';
import { useItem } from 'hooks/useItem';
import type { ItemDto } from 'types/base/models/item-dto';

import useMinitigerDetailSettings from '../home/hooks/useMinitigerDetailSettings';
import useMinitigerHomeSettings from '../home/hooks/useMinitigerHomeSettings';
import useMinitigerThemeVariables from '../home/hooks/useMinitigerThemeVariables';
import {
    getBackdropImageUrl,
    getLandscapeImageUrl,
    getPrimaryImageUrl,
    getRuntimeLabel,
    shortOverview
} from '../home/mediaUtils';
import { getItemRoute } from '../home/routingUtils';

import MinitigerExpandableOverview from './MinitigerExpandableOverview';
import MinitigerItemMenuButton from './MinitigerItemMenuButton';

import './MinitigerVideoDetails.scss';

interface Props {
    itemId: string;
}

interface ArtistProps extends Props {
    videosOnly?: boolean;
}

type MusicItemDto = ItemDto & {
    AlbumArtist?: string | null;
    Artists?: string[] | null;
};

const getArtistRef = (
    item?: MusicItemDto
) => (
    item?.AlbumArtists?.[0]
    ?? item?.ArtistItems?.[0]
    ?? null
);

const getArtistName = (
    item?: MusicItemDto
) => (
    getArtistRef(item)?.Name
    ?? item?.AlbumArtist
    ?? item?.Artists?.[0]
    ?? ''
);

const getMusicBackdrop = (
    apiClient: ReturnType<typeof useApi>['__legacyApiClient__'],
    item?: ItemDto,
    artist?: ItemDto
) => (
    artist
        ? getBackdropImageUrl(
            apiClient,
            artist
        )
        : undefined
)
?? (
    item
        ? getBackdropImageUrl(
            apiClient,
            item
        )
        : undefined
);

const playItems = (
    items: ItemDto[]
) => {
    if (!items.length) {
        return;
    }

    playbackManager.play({
        items
    }).catch(error => {
        console.error(
            '[Minitiger Music] Wiedergabe fehlgeschlagen',
            error
        );
    });
};

const MusicPageShell = ({
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
            `${detailSettings.posterWidth}px`,
        '--mt-details-season-width':
            `${detailSettings.seasonPosterWidth}px`,
        '--mt-details-content-width':
            `${detailSettings.contentWidth}px`,
        '--mt-details-cast-width':
            `${detailSettings.castWidth}px`
    } as React.CSSProperties;

    return (
        <Page
            id='minitigerMusicDetailsPage'
            className='mainAnimatedPage minitigerVideoDetailsPage minitigerMusicDetailsPage'
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

const MusicCardGrid = ({
    items,
    kind,
    apiClient
}: {
    items: ItemDto[];
    kind: 'album' | 'video';
    apiClient:
        ReturnType<typeof useApi>[
            '__legacyApiClient__'
        ];
}) => (
    <div
        className={
            kind === 'album'
                ? 'minitigerMusicAlbumGrid'
                : 'minitigerMusicVideoGrid'
        }
    >
        {items.map(item => {
            const image =
                kind === 'album'
                    ? getPrimaryImageUrl(
                        apiClient,
                        item
                    )
                    : getLandscapeImageUrl(
                        apiClient,
                        item
                    );

            return (
                <Link
                    key={
                        item.Id
                        ?? item.Name
                    }
                    to={getItemRoute(item)}
                    className={
                        kind === 'album'
                            ? 'minitigerMusicAlbumCard'
                            : 'minitigerMusicVideoCard'
                    }
                >
                    <div>
                        {kind === 'album' && (
                            <MinitigerItemMenuButton
                                apiClient={apiClient}
                                item={item}
                                title='Album-Menü'
                            />
                        )}

                        {image ? (
                            <img
                                src={image}
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
                            item.Name
                            ?? (
                                kind === 'album'
                                    ? 'Album'
                                    : 'Musikvideo'
                            )
                        }
                    </strong>

                    {item.ProductionYear && (
                        <small>
                            {item.ProductionYear}
                        </small>
                    )}
                </Link>
            );
        })}
    </div>
);

export const MinitigerMusicArtistDetails = ({
    itemId,
    videosOnly = false
}: ArtistProps) => {
    const {
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
        data: artistData,
        isPending
    } = useItem(itemId);

    const artist =
        artistData as
            ItemDto
            | undefined;

    const userId =
        apiClient?.getCurrentUserId()
        ?? '';

    const relatedQuery = useQuery({
        queryKey: [
            'Minitiger',
            'MusicArtistDetails',
            itemId
        ],
        queryFn: async () => {
            if (
                !apiClient
                || !userId
                || !artist?.Id
            ) {
                return {
                    albums: [] as ItemDto[],
                    videos: [] as ItemDto[],
                    tracks: [] as ItemDto[]
                };
            }

            const [
                albumsResult,
                videoResult,
                tracksResult
            ] = await Promise.all([
                apiClient.getItems(
                    userId,
                    {
                        ArtistIds:
                            artist.Id,
                        IncludeItemTypes:
                            'MusicAlbum',
                        Recursive: true,
                        SortBy:
                            'ProductionYear,SortName',
                        SortOrder:
                            'Descending',
                        Limit: 400,
                        Fields:
                            'Overview,Genres',
                        EnableTotalRecordCount:
                            false
                    }
                ),
                apiClient.getItems(
                    userId,
                    {
                        ArtistIds:
                            artist.Id,
                        IncludeItemTypes:
                            'MusicVideo',
                        Recursive: true,
                        SortBy:
                            'SortName',
                        SortOrder:
                            'Ascending',
                        Limit: 500,
                        Fields:
                            'Overview',
                        EnableTotalRecordCount:
                            false
                    }
                ),
                apiClient.getItems(
                    userId,
                    {
                        ArtistIds:
                            artist.Id,
                        IncludeItemTypes:
                            'Audio',
                        Recursive: true,
                        SortBy:
                            'Album,IndexNumber',
                        SortOrder:
                            'Ascending',
                        Limit: 2000,
                        EnableTotalRecordCount:
                            false
                    }
                )
            ]);

            return {
                albums:
                    (
                        albumsResult?.Items
                        ?? []
                    ) as ItemDto[],
                videos:
                    (
                        videoResult?.Items
                        ?? []
                    ) as ItemDto[],
                tracks:
                    (
                        tracksResult?.Items
                        ?? []
                    ) as ItemDto[]
            };
        },
        enabled: Boolean(
            apiClient
            && userId
            && artist?.Id
        ),
        staleTime:
            10 * 60_000
    });

    useEffect(() => {
        clearBackdrop();
    }, []);

    if (
        isPending
        || !artist
    ) {
        return (
            <Page
                id='minitigerMusicArtistLoading'
                className='mainAnimatedPage minitigerVideoDetailsPage'
                isBackButtonEnabled
            >
                <div className='minitigerDetailsLoading'>
                    Künstler wird geladen …
                </div>
            </Page>
        );
    }

    const image =
        getPrimaryImageUrl(
            apiClient,
            artist
        );

    const backdrop =
        getMusicBackdrop(
            apiClient,
            artist
        );

    const albums =
        relatedQuery.data?.albums
        ?? [];

    const videos =
        relatedQuery.data?.videos
        ?? [];

    const tracks =
        relatedQuery.data?.tracks
        ?? [];

    return (
        <MusicPageShell
            backdrop={backdrop}
            detailSettings={detailSettings}
        >
            <section className='minitigerDetailsHero minitigerMusicHero'>
                <div className='minitigerMusicSquarePoster'>
                    {image ? (
                        <img
                            src={image}
                            alt=''
                        />
                    ) : (
                        <div className='minitigerDetailsPosterFallback'>
                            ♪
                        </div>
                    )}
                </div>

                <div className='minitigerDetailsInfo'>
                    <div className='minitigerDetailsType'>
                        {
                            videosOnly
                                ? 'MUSIKVIDEOS'
                                : 'KÜNSTLER'
                        }
                    </div>

                    <h1>
                        {
                            artist.Name
                            ?? 'Künstler'
                        }
                    </h1>

                    {artist.Overview && (
                        <MinitigerExpandableOverview
                            text={artist.Overview}
                            limit={500}
                        />
                    )}

                    {artist.Genres?.length ? (
                        <div className='minitigerDetailsGenreChips minitigerMusicGenres'>
                            {artist.Genres.map(
                                genre => (
                                    <em key={genre}>
                                        {genre}
                                    </em>
                                )
                            )}
                        </div>
                    ) : null}

                    <div className='minitigerDetailsActions'>
                        <button
                            type='button'
                            className='isPrimary'
                            disabled={
                                videosOnly
                                    ? !videos.length
                                    : !tracks.length
                            }
                            onClick={() =>
                                playItems(
                                    videosOnly
                                        ? videos
                                        : tracks
                                )
                            }
                        >
                            ▶ Abspielen
                        </button>

                        <MinitigerItemMenuButton
                            apiClient={apiClient}
                            item={album}
                            title='Mehr'
                            placement='action'
                        />
                    </div>
                </div>
            </section>

            {!videosOnly
                && albums.length > 0
                && (
                <section className='minitigerDetailsSection'>
                    <div className='minitigerDetailsSectionHead'>
                        <div>
                            <h2>Alben</h2>
                            <span>
                                {albums.length}
                            </span>
                        </div>
                    </div>

                    <MusicCardGrid
                        items={albums}
                        kind='album'
                        apiClient={apiClient}
                    />
                </section>
            )}

            {videos.length > 0 && (
                <section className='minitigerDetailsSection'>
                    <div className='minitigerDetailsSectionHead'>
                        <div>
                            <h2>Musikvideos</h2>
                            <span>
                                {videos.length}
                            </span>
                        </div>
                    </div>

                    <MusicCardGrid
                        items={videos}
                        kind='video'
                        apiClient={apiClient}
                    />
                </section>
            )}
        </MusicPageShell>
    );
};

export const MinitigerMusicAlbumDetails = ({
    itemId
}: Props) => {
    const {
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
        data: albumData,
        isPending
    } = useItem(itemId);

    const album =
        albumData as
            MusicItemDto
            | undefined;

    const artistRef =
        getArtistRef(album);

    const {
        data: artistData
    } = useItem(
        artistRef?.Id
        ?? undefined
    );

    const artist =
        artistData as
            ItemDto
            | undefined;

    const userId =
        apiClient?.getCurrentUserId()
        ?? '';

    const relatedQuery = useQuery({
        queryKey: [
            'Minitiger',
            'MusicAlbumDetails',
            itemId,
            artistRef?.Id
        ],
        queryFn: async () => {
            if (
                !apiClient
                || !userId
                || !album?.Id
            ) {
                return {
                    tracks: [] as ItemDto[],
                    albums: [] as ItemDto[]
                };
            }

            const tracksResult =
                await apiClient.getItems(
                    userId,
                    {
                        ParentId:
                            album.Id,
                        IncludeItemTypes:
                            'Audio',
                        Recursive:
                            true,
                        SortBy:
                            'IndexNumber',
                        SortOrder:
                            'Ascending',
                        Limit: 1000,
                        EnableTotalRecordCount:
                            false
                    }
                );

            let albums: ItemDto[] = [];

            if (artistRef?.Id) {
                const albumsResult =
                    await apiClient.getItems(
                        userId,
                        {
                            ArtistIds:
                                artistRef.Id,
                            IncludeItemTypes:
                                'MusicAlbum',
                            Recursive:
                                true,
                            SortBy:
                                'ProductionYear,SortName',
                            SortOrder:
                                'Descending',
                            Limit: 300,
                            EnableTotalRecordCount:
                                false
                        }
                    );

                albums = (
                    albumsResult?.Items
                    ?? []
                ) as ItemDto[];
            }

            return {
                tracks:
                    (
                        tracksResult?.Items
                        ?? []
                    ) as ItemDto[],
                albums:
                    albums.filter(
                        value =>
                            value.Id
                            !== album.Id
                    )
            };
        },
        enabled: Boolean(
            apiClient
            && userId
            && album?.Id
        ),
        staleTime:
            10 * 60_000
    });

    useEffect(() => {
        clearBackdrop();
    }, []);

    if (
        isPending
        || !album
    ) {
        return (
            <Page
                id='minitigerMusicAlbumLoading'
                className='mainAnimatedPage minitigerVideoDetailsPage'
                isBackButtonEnabled
            >
                <div className='minitigerDetailsLoading'>
                    Album wird geladen …
                </div>
            </Page>
        );
    }

    const image =
        getPrimaryImageUrl(
            apiClient,
            album
        );

    const backdrop =
        getMusicBackdrop(
            apiClient,
            album,
            artist
        );

    const tracks =
        relatedQuery.data?.tracks
        ?? [];

    const otherAlbums =
        relatedQuery.data?.albums
        ?? [];

    return (
        <MusicPageShell
            backdrop={backdrop}
            detailSettings={detailSettings}
        >
            <section className='minitigerDetailsHero minitigerMusicHero'>
                <div className='minitigerMusicSquarePoster'>
                    {image ? (
                        <img
                            src={image}
                            alt=''
                        />
                    ) : (
                        <div className='minitigerDetailsPosterFallback'>
                            ♪
                        </div>
                    )}
                </div>

                <div className='minitigerDetailsInfo'>
                    <div className='minitigerDetailsType'>
                        ALBUM
                    </div>

                    <h1>
                        {
                            album.Name
                            ?? 'Album'
                        }
                    </h1>

                    {artistRef?.Id ? (
                        <Link
                            className='minitigerDetailsParentTitle'
                            to={
                                `/minitigerdetails?id=${
                                    encodeURIComponent(
                                        artistRef.Id
                                    )
                                }`
                            }
                        >
                            {
                                artist?.Name
                                ?? artistRef.Name
                                ?? getArtistName(album)
                            }
                        </Link>
                    ) : (
                        getArtistName(album)
                            ? (
                                <div className='minitigerDetailsParentTitle'>
                                    {getArtistName(album)}
                                </div>
                            )
                            : null
                    )}

                    <div className='minitigerDetailsMeta'>
                        {album.ProductionYear && (
                            <span>
                                {album.ProductionYear}
                            </span>
                        )}

                        <span>
                            {
                                tracks.length
                            } Titel
                        </span>

                        {album.RunTimeTicks && (
                            <span>
                                {
                                    getRuntimeLabel(
                                        album.RunTimeTicks
                                    )
                                }
                            </span>
                        )}
                    </div>

                    {album.Overview && (
                        <MinitigerExpandableOverview
                            text={album.Overview}
                            limit={500}
                        />
                    )}

                    <div className='minitigerDetailsActions'>
                        <button
                            type='button'
                            className='isPrimary'
                            disabled={!tracks.length}
                            onClick={() =>
                                playItems(tracks)
                            }
                        >
                            ▶ Abspielen
                        </button>

                        <MinitigerItemMenuButton
                            apiClient={apiClient}
                            item={item}
                            title='Mehr'
                            placement='action'
                        />
                    </div>
                </div>
            </section>

            <section className='minitigerDetailsSection'>
                <div className='minitigerDetailsSectionHead'>
                    <div>
                        <h2>Titel</h2>
                        <span>
                            {tracks.length}
                        </span>
                    </div>
                </div>

                <div className='minitigerMusicTrackList'>
                    {tracks.map(
                        (
                            track,
                            index
                        ) => (
                            <button
                                key={
                                    track.Id
                                    ?? `${track.Name}-${index}`
                                }
                                type='button'
                                className='minitigerMusicTrackRow'
                                onClick={() =>
                                    playItems(
                                        [ track ]
                                    )
                                }
                            >
                                <span className='minitigerMusicTrackNumber'>
                                    {
                                        track.IndexNumber
                                        ?? index + 1
                                    }.
                                </span>

                                <strong>
                                    {
                                        track.Name
                                        ?? 'Titel'
                                    }
                                </strong>

                                <span className='minitigerMusicTrackRuntime'>
                                    {
                                        getRuntimeLabel(
                                            track.RunTimeTicks
                                        )
                                        ?? ''
                                    }
                                </span>
                            </button>
                        )
                    )}
                </div>
            </section>

            {otherAlbums.length > 0 && (
                <section className='minitigerDetailsSection'>
                    <div className='minitigerDetailsSectionHead'>
                        <div>
                            <h2>
                                Mehr von {
                                    artist?.Name
                                    ?? artistRef?.Name
                                    ?? 'diesem Künstler'
                                }
                            </h2>
                        </div>
                    </div>

                    <MusicCardGrid
                        items={otherAlbums}
                        kind='album'
                        apiClient={apiClient}
                    />
                </section>
            )}
        </MusicPageShell>
    );
};

export const MinitigerMusicVideoDetails = ({
    itemId
}: Props) => {
    const {
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

    useEffect(() => {
        clearBackdrop();
    }, []);

    if (
        isPending
        || !item
    ) {
        return (
            <Page
                id='minitigerMusicVideoLoading'
                className='mainAnimatedPage minitigerVideoDetailsPage'
                isBackButtonEnabled
            >
                <div className='minitigerDetailsLoading'>
                    Musikvideo wird geladen …
                </div>
            </Page>
        );
    }

    const image =
        getLandscapeImageUrl(
            apiClient,
            item
        );

    const backdrop =
        getBackdropImageUrl(
            apiClient,
            item
        );

    return (
        <MusicPageShell
            backdrop={backdrop}
            detailSettings={detailSettings}
        >
            <section className='minitigerDetailsHero isEpisode minitigerMusicVideoDetailHero'>
                <div className='minitigerEpisodeHeroImage'>
                    {image ? (
                        <img
                            src={image}
                            alt=''
                        />
                    ) : (
                        <div className='minitigerDetailsPosterFallback'>
                            ♪
                        </div>
                    )}
                </div>

                <div className='minitigerDetailsInfo'>
                    <div className='minitigerDetailsType'>
                        MUSIKVIDEO
                    </div>

                    <h1>
                        {
                            item.Name
                            ?? 'Musikvideo'
                        }
                    </h1>

                    {item.RunTimeTicks && (
                        <div className='minitigerDetailsMeta'>
                            <span>
                                {
                                    getRuntimeLabel(
                                        item.RunTimeTicks
                                    )
                                }
                            </span>
                        </div>
                    )}

                    {item.Overview && (
                        <MinitigerExpandableOverview
                            text={item.Overview}
                            limit={500}
                        />
                    )}

                    <div className='minitigerDetailsActions'>
                        <button
                            type='button'
                            className='isPrimary'
                            onClick={() =>
                                playItems(
                                    [ item ]
                                )
                            }
                        >
                            ▶ Abspielen
                        </button>

                        <MinitigerItemMenuButton
                            apiClient={apiClient}
                            item={item}
                            title='Mehr'
                            placement='action'
                        />
                    </div>
                </div>
            </section>
        </MusicPageShell>
    );
};

export const MinitigerMusicVideoCollectionDetails = ({
    itemId
}: Props) => {
    const {
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

    const videosQuery = useQuery({
        queryKey: [
            'Minitiger',
            'MusicVideoCollection',
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
                            'MusicVideo,Video',
                        Recursive: true,
                        SortBy:
                            'SortName',
                        SortOrder:
                            'Ascending',
                        Limit: 1000,
                        Fields:
                            'Overview',
                        EnableTotalRecordCount:
                            false
                    }
                );

            return (
                result?.Items
                ?? []
            ) as ItemDto[];
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
                id='minitigerMusicVideoCollectionLoading'
                className='mainAnimatedPage minitigerVideoDetailsPage'
                isBackButtonEnabled
            >
                <div className='minitigerDetailsLoading'>
                    Musikvideos werden geladen …
                </div>
            </Page>
        );
    }

    const image =
        getPrimaryImageUrl(
            apiClient,
            item
        );

    const backdrop =
        getBackdropImageUrl(
            apiClient,
            item
        );

    const videos =
        videosQuery.data
        ?? [];

    return (
        <MusicPageShell
            backdrop={backdrop}
            detailSettings={detailSettings}
        >
            <section className='minitigerDetailsHero minitigerMusicHero'>
                <div className='minitigerMusicSquarePoster'>
                    {image ? (
                        <img
                            src={image}
                            alt=''
                        />
                    ) : (
                        <div className='minitigerDetailsPosterFallback'>
                            ♪
                        </div>
                    )}
                </div>

                <div className='minitigerDetailsInfo'>
                    <div className='minitigerDetailsType'>
                        MUSIKVIDEOS
                    </div>

                    <h1>
                        {
                            item.Name
                            ?? 'Musikvideos'
                        }
                    </h1>

                    <div className='minitigerDetailsMeta'>
                        <span>
                            {
                                videos.length
                            } Musikvideos
                        </span>
                    </div>

                    {item.Overview && (
                        <MinitigerExpandableOverview
                            text={item.Overview}
                            limit={500}
                        />
                    )}

                    <div className='minitigerDetailsActions'>
                        <button
                            type='button'
                            className='isPrimary'
                            disabled={!videos.length}
                            onClick={() =>
                                playItems(videos)
                            }
                        >
                            ▶ Abspielen
                        </button>
                    </div>
                </div>
            </section>

            <section className='minitigerDetailsSection'>
                <div className='minitigerDetailsSectionHead'>
                    <div>
                        <h2>Musikvideos</h2>
                        <span>
                            {videos.length}
                        </span>
                    </div>
                </div>

                <MusicCardGrid
                    items={videos}
                    kind='video'
                    apiClient={apiClient}
                />
            </section>
        </MusicPageShell>
    );
};
