import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { useQueryClient } from '@tanstack/react-query';
import React, {
    useEffect,
    useMemo,
    useState
} from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { clearBackdrop } from 'components/backdrop/backdrop';
import Page from 'components/Page';
import { playbackManager } from 'components/playback/playbackmanager';
import { useApi } from 'hooks/useApi';
import {
    useGetItems,
    useToggleFavoriteMutation,
    useTogglePlayedMutation
} from 'hooks/useFetchItems';
import { useItem } from 'hooks/useItem';
import type { ItemDto } from 'types/base/models/item-dto';

import MinitigerDetailAudioFlags from './MinitigerDetailAudioFlags';
import MinitigerItemMenuButton from './MinitigerItemMenuButton';
import MinitigerRail from './MinitigerRail';
import MinitigerSeasonSwitcher from './MinitigerSeasonSwitcher';
import MinitigerSelectDropdown from './MinitigerSelectDropdown';
import {
    getMinitigerEpisodeCode,
    isMinitigerAvailableEpisode
} from './episodeUtils';

import useMinitigerBannerMembership from '../home/hooks/useMinitigerBannerMembership';
import useMinitigerDetailSettings from '../home/hooks/useMinitigerDetailSettings';
import useMinitigerRowMediaStreams from '../home/hooks/useMinitigerRowMediaStreams';
import useMinitigerHomeSettings from '../home/hooks/useMinitigerHomeSettings';
import useMinitigerThemeVariables from '../home/hooks/useMinitigerThemeVariables';
import {
    getBackdropImageUrl,
    getBingeEndLabel,
    getEndTimeLabel,
    getLandscapeImageUrl,
    getLanguageFlagUrl,
    getLogoImageUrl,
    getMediaTypeName,
    getPrimaryImageUrl,
    getRatingLabel,
    getRuntimeLabel,
    getStreamLanguages,
    shortOverview
} from '../home/mediaUtils';
import { getItemRoute } from '../home/routingUtils';

import './MinitigerVideoDetails.scss';

interface DetailPerson {
    Id?: string | null;
    Name?: string | null;
    Role?: string | null;
    Type?: string | null;
    PrimaryImageTag?: string | null;
}

interface DetailMediaSource {
    Id?: string | null;
    Name?: string | null;
    Path?: string | null;
    Container?: string | null;
}

const noItemId = '00000000000000000000000000000000';

const getPersonImageUrl = (
    apiClient: ReturnType<typeof useApi>['__legacyApiClient__'],
    person: DetailPerson
) => {
    if (
        !apiClient
        || !person.Id
        || !person.PrimaryImageTag
    ) {
        return undefined;
    }

    return apiClient.getImageUrl(
        person.Id,
        {
            type: 'Primary',
            tag: person.PrimaryImageTag,
            maxWidth: 320,
            quality: 90
        }
    ) || undefined;
};

const MinitigerVideoDetails = () => {
    const [ searchParams ] = useSearchParams();
    const itemId = searchParams.get('id') ?? undefined;

    const {
        user,
        __legacyApiClient__: apiClient
    } = useApi();


    const {
        settings
    } = useMinitigerHomeSettings();

    useMinitigerThemeVariables(settings);

    const {
        settings: detailSettings
    } = useMinitigerDetailSettings();

    const queryClient = useQueryClient();
    const favoriteMutation =
        useToggleFavoriteMutation();
    const playedMutation =
        useTogglePlayedMutation();

    const {
        data: fetchedItem,
        isPending: itemPending
    } = useItem(itemId);

    const item =
        fetchedItem as ItemDto | undefined;

    const isSeries =
        String(item?.Type ?? '').toLowerCase()
        === 'series';
    const isMovie =
        String(item?.Type ?? '').toLowerCase()
        === 'movie';

    const isAdmin =
        Boolean(
            user?.Policy?.IsAdministrator
        );

    const bannerMembership =
        useMinitigerBannerMembership(
            item?.Id,
            item?.Type,
            isAdmin
            && (
                isSeries
                || isMovie
            )
        );

    const {
        data: seasonsData,
        isPending: seasonsPending
    } = useGetItems({
        parentId:
            isSeries
                ? (item?.Id ?? noItemId)
                : noItemId,
        recursive: false,
        limit: 100,
        fields: [
            ItemFields.Overview,
            ItemFields.PrimaryImageAspectRatio,
            ItemFields.MediaSources
        ],
        imageTypeLimit: 2,
        enableImageTypes: [
            ImageType.Primary,
            ImageType.Thumb,
            ImageType.Backdrop
        ],
        enableTotalRecordCount: false,
        includeItemTypes: [
            BaseItemKind.Season
        ]
    });

    const seasons = useMemo(
        () => [ ...(seasonsData?.Items ?? []) ]
            .sort((left, right) => (
                (left.IndexNumber ?? 9999)
                - (right.IndexNumber ?? 9999)
            )),
        [seasonsData?.Items]
    );

    const seasonMediaDetails =
        useMinitigerRowMediaStreams(
            seasons,
            settings.showAudioFlags
        );

    const {
        data: allSeriesEpisodesData
    } = useGetItems({
        parentId:
            isSeries
                ? (item?.Id ?? noItemId)
                : noItemId,
        recursive: true,
        limit: 5000,
        fields: [
            ItemFields.Overview
        ],
        imageTypeLimit: 0,
        enableTotalRecordCount: false,
        includeItemTypes: [
            BaseItemKind.Episode
        ]
    });

    const allSeriesEpisodes = useMemo(
        () => (
            (allSeriesEpisodesData?.Items ?? []) as ItemDto[]
        ).filter(isMinitigerAvailableEpisode),
        [allSeriesEpisodesData?.Items]
    );

    const [
        selectedSeasonId,
        setSelectedSeasonId
    ] = useState('');

    useEffect(() => {
        if (!isSeries) {
            setSelectedSeasonId('');
            return;
        }

        if (
            selectedSeasonId
            && seasons.some(
                season =>
                    season.Id
                    === selectedSeasonId
            )
        ) {
            return;
        }

        const preferred =
            seasons.find(
                season =>
                    season.IndexNumber === 1
            )
            ?? seasons[0];

        setSelectedSeasonId(
            preferred?.Id ?? ''
        );
    }, [
        isSeries,
        seasons,
        selectedSeasonId
    ]);

    const {
        data: episodesData,
        isPending: episodesPending
    } = useGetItems({
        parentId:
            selectedSeasonId
            || noItemId,
        recursive: false,
        limit: 300,
        fields: [
            ItemFields.Overview,
            ItemFields.PrimaryImageAspectRatio,
            ItemFields.MediaSources
        ],
        imageTypeLimit: 2,
        enableImageTypes: [
            ImageType.Primary,
            ImageType.Thumb,
            ImageType.Backdrop
        ],
        enableTotalRecordCount: false,
        includeItemTypes: [
            BaseItemKind.Episode
        ]
    });

    const episodes = useMemo(
        () => [ ...(episodesData?.Items ?? []) ]
            .filter(isMinitigerAvailableEpisode)
            .sort((left, right) => (
                (left.IndexNumber ?? 9999)
                - (right.IndexNumber ?? 9999)
            )),
        [episodesData?.Items]
    );

    const episodeMediaDetails =
        useMinitigerRowMediaStreams(
            episodes,
            settings.showAudioFlags
        );

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
            Boolean(item?.UserData?.IsFavorite)
        );
        setPlayed(
            Boolean(item?.UserData?.Played)
        );
    }, [
        item?.Id,
        item?.UserData?.IsFavorite,
        item?.UserData?.Played
    ]);

    const remoteTrailerUrl =
        (
            (
                item?.RemoteTrailers
                ?? []
            ) as Array<{
                Url?: string | null;
            }>
        )
            .map(
                trailer =>
                    trailer.Url
            )
            .find(
                (
                    url
                ): url is string =>
                    Boolean(url)
            );

    const mediaSources =
        (
            item?.MediaSources
            ?? []
        ) as unknown as DetailMediaSource[];

    const [
        mediaSourceId,
        setMediaSourceId
    ] = useState('');

    useEffect(() => {
        if (
            mediaSources.length === 0
        ) {
            setMediaSourceId('');
            return;
        }

        if (
            mediaSourceId
            && mediaSources.some(
                source =>
                    source.Id === mediaSourceId
            )
        ) {
            return;
        }

        setMediaSourceId(
            mediaSources[0]?.Id ?? ''
        );
    }, [
        item?.Id,
        mediaSourceId,
        mediaSources
    ]);

    useEffect(() => {
        clearBackdrop();
    }, []);

    const playItem = () => {
        if (!item) {
            return;
        }

        playbackManager.play({
            items: [ item ],
            startPositionTicks:
                item.UserData
                    ?.PlaybackPositionTicks
                ?? 0,
            mediaSourceId:
                mediaSourceId
                || undefined
        }).catch(error => {
            console.error(
                '[Minitiger Details] Wiedergabe fehlgeschlagen',
                error
            );
        });
    };


    const playRailEpisode = (
        event: React.MouseEvent<HTMLButtonElement>,
        episode: ItemDto
    ) => {
        event.preventDefault();
        event.stopPropagation();

        playbackManager.play({
            items: [ episode ],
            startPositionTicks:
                episode.UserData
                    ?.PlaybackPositionTicks
                ?? 0
        }).catch(error => {
            console.error(
                '[Minitiger Details] Folgen-Schnellstart fehlgeschlagen',
                error
            );
        });
    };

    const toggleFavorite = async () => {
        if (
            !item?.Id
            || favoriteMutation.isPending
        ) {
            return;
        }

        const next = !favorite;

        await favoriteMutation.mutateAsync({
            itemId: item.Id,
            isFavorite: favorite
        });

        setFavorite(next);

        await queryClient.invalidateQueries({
            queryKey: [ 'Items' ]
        });
    };

    const togglePlayed = async () => {
        if (
            !item?.Id
            || playedMutation.isPending
        ) {
            return;
        }

        const next = !played;

        await playedMutation.mutateAsync({
            itemId: item.Id,
            isPlayed: played
        });

        setPlayed(next);

        await queryClient.invalidateQueries({
            queryKey: [ 'Items' ]
        });
    };

    const openMenu = async (
        event: React.MouseEvent<HTMLButtonElement>
    ) => {
        if (
            !apiClient
            || !item?.Id
        ) {
            return;
        }

        try {
            const itemContextMenu =
                await import(
                    'components/itemContextMenu'
                );

            const currentUser =
                await apiClient.getCurrentUser();

            await itemContextMenu.show({
                item,
                user: currentUser,
                positionTo:
                    event.currentTarget,
                play: true,
                queue: true,
                shuffle: isSeries,
                playlist: true
            });
        } catch (error) {
            console.error(
                '[Minitiger Details] Menü konnte nicht geöffnet werden',
                error
            );
        }
    };

    if (itemPending) {
        return (
            <Page
                id='minitigerVideoDetailsPage'
                className='mainAnimatedPage minitigerVideoDetailsPage'
                isBackButtonEnabled
            >
                <div className='minitigerDetailsLoading'>
                    Details werden geladen …
                </div>
            </Page>
        );
    }

    if (
        !item
        || (!isSeries && !isMovie)
    ) {
        return (
            <Page
                id='minitigerVideoDetailsPage'
                className='mainAnimatedPage minitigerVideoDetailsPage'
                isBackButtonEnabled
            >
                <div className='minitigerDetailsLoading'>
                    Dieser Inhalt verwendet noch die originale
                    Jellyfin-Detailansicht.
                </div>
            </Page>
        );
    }

    const backdropUrl =
        getBackdropImageUrl(
            apiClient,
            item
        );

    const posterUrl =
        getPrimaryImageUrl(
            apiClient,
            item
        );

    const logoUrl =
        getLogoImageUrl(
            apiClient,
            item
        );

    const rating =
        getRatingLabel(
            item.OfficialRating
        );

    const audio =
        getStreamLanguages(
            item,
            'Audio'
        );

    const subtitles =
        getStreamLanguages(
            item,
            'Subtitle'
        );

    const genres =
        item.Genres ?? [];

    const studios =
        (
            item.Studios
            ?? []
        )
            .map(studio => studio.Name)
            .filter(
                (name): name is string =>
                    Boolean(name)
            );

    const people =
        (
            item.People
            ?? []
        ) as unknown as DetailPerson[];

    const cast = people
        .filter(person => (
            !person.Type
            || person.Type === 'Actor'
            || person.Type === 'GuestStar'
        ))
        .slice(0, 24);

    const seriesTotalTicks = isSeries
        ? allSeriesEpisodes.reduce(
            (sum, episode) => sum + (episode.RunTimeTicks ?? 0),
            0
        )
        : 0;

    const seriesRemainingTicks = isSeries
        ? allSeriesEpisodes.reduce((sum, episode) => {
            if (episode.UserData?.Played) {
                return sum;
            }

            const runtime = episode.RunTimeTicks ?? 0;
            const position = episode.UserData?.PlaybackPositionTicks ?? 0;
            return sum + Math.max(0, runtime - position);
        }, 0)
        : 0;

    const meta = [
        getMediaTypeName(item.Type),
        rating,
        item.ProductionYear,
        isSeries && seasons.length > 0
            ? `${seasons.length} Staffeln`
            : null,
        isSeries
            ? getRuntimeLabel(seriesTotalTicks)
            : null,
        isSeries
            ? getBingeEndLabel(seriesRemainingTicks)
            : null,
        isMovie
            ? getRuntimeLabel(
                item.RunTimeTicks
            )
            : null,
        isMovie
            ? getEndTimeLabel(
                item.RunTimeTicks,
                item.UserData?.PlaybackPositionTicks ?? 0
            )
            : null,
        item.CommunityRating != null
            ? `★ ${item.CommunityRating.toFixed(1)}/10`
            : null
    ].filter(Boolean);

    const detailStyle = {
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
            id='minitigerVideoDetailsPage'
            className='mainAnimatedPage minitigerVideoDetailsPage'
            isBackButtonEnabled
            style={detailStyle}
            data-cast-shape={detailSettings.castShape}
        >
            <div
                className='minitigerDetailsBackdrop'
                style={
                    backdropUrl
                        ? {
                            backgroundImage:
                                `url("${backdropUrl}")`
                        }
                        : undefined
                }
            />

            <div className='minitigerDetailsShade' />

            <main className='minitigerDetailsSurface'>
                <section className='minitigerDetailsHero'>
                    <div className='minitigerDetailsPoster'>
                        {posterUrl ? (
                            <img
                                src={posterUrl}
                                alt=''
                            />
                        ) : (
                            <div className='minitigerDetailsPosterFallback'>
                                🐯
                            </div>
                        )}
                    </div>

                    <div className='minitigerDetailsInfo'>
                        <div className='minitigerDetailsType'>
                            {
                                isSeries
                                    ? 'SERIE'
                                    : 'FILM'
                            }
                        </div>

                        {logoUrl ? (
                            <img
                                className='minitigerDetailsLogo'
                                src={logoUrl}
                                alt={item.Name ?? ''}
                            />
                        ) : (
                            <h1>
                                {item.Name ?? 'Unbekannt'}
                            </h1>
                        )}

                        <div className='minitigerDetailsMeta'>
                            {meta.map((value, index) => (
                                <span
                                    key={`${value}-${index}`}
                                >
                                    {value}
                                </span>
                            ))}
                        </div>

                        {(audio.length > 0
                            || subtitles.length > 0)
                            && (
                                <div className='minitigerDetailsLanguages'>
                                    {audio.length > 0 && (
                                        <span>
                                            Audio: {
                                                audio.join(', ')
                                            }
                                        </span>
                                    )}

                                    {subtitles.length > 0 && (
                                        <span>
                                            Untertitel: {
                                                subtitles.join(', ')
                                            }
                                        </span>
                                    )}
                                </div>
                            )}

                        {isMovie
                            && mediaSources.length > 1
                            && (
                                <div className='minitigerDetailsVersion'>
                                    <span>Version</span>
                                    <MinitigerSelectDropdown
                                        value={mediaSourceId}
                                        ariaLabel='Version auswählen'
                                        onChange={setMediaSourceId}
                                        options={mediaSources.map(
                                            (source, index) => ({
                                                value: source.Id ?? '',
                                                label:
                                                    source.Name
                                                    || source.Path
                                                    || `Version ${index + 1}`
                                            })
                                        )}
                                    />
                                </div>
                            )}

                        <div className='minitigerDetailsActions'>
                            <button
                                type='button'
                                className='isPrimary'
                                onClick={playItem}
                            >
                                ▶ Abspielen
                            </button>

                            {remoteTrailerUrl && (
                                <button
                                    type='button'
                                    onClick={() =>
                                        window.open(
                                            remoteTrailerUrl,
                                            '_blank',
                                            'noopener,noreferrer'
                                        )
                                    }
                                >
                                    ▷ Trailer
                                </button>
                            )}

                            <button
                                type='button'
                                className={
                                    played
                                        ? 'isActive'
                                        : ''
                                }
                                onClick={togglePlayed}
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
                                onClick={toggleFavorite}
                            >
                                {favorite ? '♥' : '♡'}
                            </button>

                            {isAdmin
                                && (
                                    isSeries
                                    || isMovie
                                )
                                && (
                                    <button
                                        type='button'
                                        className={
                                            bannerMembership.inBanner
                                                ? 'isActive'
                                                : ''
                                        }
                                        onClick={
                                            bannerMembership.toggle
                                        }
                                        disabled={
                                            bannerMembership.isSaving
                                            || bannerMembership.isPending
                                        }
                                        title={
                                            bannerMembership.inBanner
                                                ? 'Aus dem Minitiger Banner entfernen'
                                                : 'Zum Minitiger Banner hinzufügen'
                                        }
                                    >
                                        {
                                            bannerMembership.inBanner
                                                ? '⊟ Banner'
                                                : '⊞ Banner'
                                        }
                                    </button>
                                )}

                            <button
                                type='button'
                                onClick={openMenu}
                            >
                                ⋮
                            </button>
                        </div>

                        {item.Overview && (
                            <p className='minitigerDetailsOverview'>
                                {item.Overview}
                            </p>
                        )}

                        {(studios.length > 0
                            || genres.length > 0)
                            && (
                                <div className='minitigerDetailsExtraMeta minitigerDetailsStudioGenreMeta'>
                                    {studios.length > 0 && (
                                        <div className='minitigerDetailsStudiosRow'>
                                            <strong>Studios</strong>
                                            <span>
                                                {studios.join(' · ')}
                                            </span>
                                        </div>
                                    )}

                                    {genres.length > 0 && (
                                        <div className='minitigerDetailsGenresRow'>
                                            <strong>Genres</strong>
                                            <span className='minitigerDetailsGenreChips'>
                                                {genres.map(genre => (
                                                    <em key={genre}>
                                                        {genre}
                                                    </em>
                                                ))}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                    </div>
                </section>

                {isSeries && (
                    <>
                        <section className='minitigerDetailsSection minitigerSeriesContentsSection'>
                            <div className='minitigerDetailsSectionHead'>
                                <div>
                                    <h2>Inhalte</h2>
                                    <span>
                                        {
                                            episodes.length
                                        } Folgen
                                    </span>
                                </div>

                                {seasons.length > 0 && (
                                    <MinitigerSeasonSwitcher
                                        seasons={seasons}
                                        value={selectedSeasonId}
                                        onChange={setSelectedSeasonId}
                                    />
                                )}
                            </div>

                            {episodesPending
                                ? (
                                    <div className='minitigerDetailsInlineStatus'>
                                        Folgen werden geladen …
                                    </div>
                                )
                                : (
                                    <MinitigerRail
                                        className='minitigerDetailsEpisodeRow'
                                        ariaLabel='Folgen'
                                    >
                                        {episodes.map(episode => {
                                            const imageUrl =
                                                getLandscapeImageUrl(
                                                    apiClient,
                                                    episode
                                                );
                                            const audioFlagItem = episode.Id
                                                ? episodeMediaDetails?.get(episode.Id) ?? episode
                                                : episode;

                                            return (
                                                <Link
                                                    key={
                                                        episode.Id
                                                        ?? episode.Name
                                                    }
                                                    to={
                                                        getItemRoute(
                                                            episode
                                                        )
                                                    }
                                                    className='minitigerDetailsEpisodeCard'
                                                    onMouseEnter={event => {
                                                        if (window.NativeShell) {
                                                            event.currentTarget.classList.add(
                                                                'minitigerNativeHover'
                                                            );
                                                        }
                                                    }}
                                                    onMouseLeave={event => {
                                                        event.currentTarget.classList.remove(
                                                            'minitigerNativeHover'
                                                        );
                                                    }}
                                                >
                                                    <div>
                                                        {imageUrl ? (
                                                            <img
                                                                src={
                                                                    imageUrl
                                                                }
                                                                alt=''
                                                            />
                                                        ) : (
                                                            <span />
                                                        )}

                                                        <button
                                                            type='button'
                                                            className='minitigerDetailsEpisodePlay'
                                                            title='Abspielen'
                                                            aria-label={`${episode.Name ?? 'Episode'} abspielen`}
                                                            onClick={event =>
                                                                playRailEpisode(
                                                                    event,
                                                                    episode
                                                                )
                                                            }
                                                        >
                                                            ▶
                                                        </button>

                                                        <MinitigerDetailAudioFlags
                                                            item={audioFlagItem}
                                                            enabled={settings.showAudioFlags}
                                                        />
                                                    </div>

                                                    <strong>
                                                        {
                                                            episode.Name
                                                            ?? 'Episode'
                                                        }
                                                    </strong>

                                                    <small>
                                                        {[
                                                            getMinitigerEpisodeCode(
                                                                episode
                                                            ),
                                                            getRuntimeLabel(
                                                                episode.RunTimeTicks
                                                            )
                                                        ]
                                                            .filter(
                                                                Boolean
                                                            )
                                                            .join(
                                                                ' · '
                                                            )}
                                                    </small>

                                                    <p>
                                                        {
                                                            shortOverview(
                                                                episode.Overview,
                                                                150
                                                            )
                                                            || 'Keine Beschreibung hinterlegt.'
                                                        }
                                                    </p>
                                                </Link>
                                            );
                                        })}
                                    </MinitigerRail>
                                )}
                        </section>

                        <section className='minitigerDetailsSection'>
                            <div className='minitigerDetailsSectionHead'>
                                <div>
                                    <h2>Staffeln</h2>
                                </div>
                            </div>

                            {seasonsPending ? (
                                <div className='minitigerDetailsInlineStatus'>
                                    Staffeln werden geladen …
                                </div>
                            ) : (
                                <MinitigerRail
                                    className='minitigerDetailsSeasonRow'
                                    ariaLabel='Staffeln'
                                    wrap={
                                        detailSettings
                                            .seasonWrapEnabled
                                    }
                                >
                                    {seasons.map(season => {
                                        const detailedSeason =
                                            season.Id
                                                ? seasonMediaDetails
                                                    ?.get(
                                                        season.Id
                                                    )
                                                : undefined;

                                        const displaySeason =
                                            detailedSeason
                                            ?? season;

                                        const seasonPoster =
                                            getPrimaryImageUrl(
                                                apiClient,
                                                season
                                            );

                                        const seasonPlayed =
                                            Boolean(
                                                season.UserData
                                                    ?.Played
                                            );

                                        const seasonUnplayed =
                                            season.UserData
                                                ?.UnplayedItemCount
                                            ?? 0;

                                        const seasonAudioFlags =
                                            settings.showAudioFlags
                                                ? getStreamLanguages(
                                                    displaySeason,
                                                    'Audio'
                                                )
                                                    .map(
                                                        language => ({
                                                            language,
                                                            url:
                                                                getLanguageFlagUrl(
                                                                    language
                                                                )
                                                        })
                                                    )
                                                    .filter(
                                                        (
                                                            flag
                                                        ): flag is {
                                                            language: string;
                                                            url: string;
                                                        } =>
                                                            Boolean(
                                                                flag.url
                                                            )
                                                    )
                                                    .slice(
                                                        0,
                                                        3
                                                    )
                                                : [];

                                        return (
                                            <Link
                                                key={
                                                    season.Id
                                                    ?? season.Name
                                                }
                                                to={
                                                    getItemRoute(
                                                        season
                                                    )
                                                }
                                                className='minitigerDetailsSeasonCard'
                                            >
                                                <div className='minitigerDetailsSeasonVisual'>
                                                    <MinitigerItemMenuButton
                                                        apiClient={apiClient}
                                                        item={season}
                                                        title='Staffel-Menü'
                                                    />

                                                    {seasonPoster ? (
                                                        <img
                                                            src={
                                                                seasonPoster
                                                            }
                                                            alt=''
                                                        />
                                                    ) : (
                                                        <span />
                                                    )}

                                                    {settings.showPlayedIndicators
                                                        && (
                                                            seasonPlayed
                                                            || seasonUnplayed > 0
                                                        )
                                                        && (
                                                            <span
                                                                className={[
                                                                    'minitigerDetailsSeasonPlayed',
                                                                    seasonPlayed
                                                                        ? 'isComplete'
                                                                        : ''
                                                                ]
                                                                    .filter(
                                                                        Boolean
                                                                    )
                                                                    .join(
                                                                        ' '
                                                                    )}
                                                            >
                                                                {
                                                                    seasonPlayed
                                                                        ? '✓'
                                                                        : seasonUnplayed
                                                                }
                                                            </span>
                                                        )}

                                                    {seasonAudioFlags.length > 0 && (
                                                        <span className='minitigerDetailsSeasonAudio'>
                                                            {seasonAudioFlags.map(
                                                                flag => (
                                                                    <img
                                                                        key={
                                                                            flag.language
                                                                        }
                                                                        src={
                                                                            flag.url
                                                                        }
                                                                        alt={
                                                                            flag.language
                                                                        }
                                                                        title={
                                                                            flag.language
                                                                        }
                                                                    />
                                                                )
                                                            )}
                                                        </span>
                                                    )}
                                                </div>

                                                <strong>
                                                    {
                                                        season.Name
                                                        ?? 'Staffel'
                                                    }
                                                </strong>
                                            </Link>
                                        );
                                    })}
                                </MinitigerRail>
                            )}
                        </section>
                    </>
                )}

                {cast.length > 0 && (
                    <section className='minitigerDetailsSection'>
                        <div className='minitigerDetailsSectionHead'>
                            <div>
                                <h2>
                                    Besetzung &amp; Mitwirkende
                                </h2>
                            </div>
                        </div>

                        <MinitigerRail
                            className='minitigerDetailsCastRow'
                            ariaLabel='Besetzung und Mitwirkende'
                        >
                            {cast.map((person, index) => {
                                const imageUrl =
                                    getPersonImageUrl(
                                        apiClient,
                                        person
                                    );

                                return (
                                    <Link
                                        key={
                                            person.Id
                                            ?? `${person.Name}-${index}`
                                        }
                                        to={
                                            person.Id
                                                ? `/minitigerdetails?id=${encodeURIComponent(person.Id)}`
                                                : '#'
                                        }
                                        className='minitigerDetailsCastCard'
                                    >
                                        <div>
                                            <MinitigerItemMenuButton
                                                apiClient={apiClient}
                                                item={{
                                                    Id: person.Id,
                                                    Name: person.Name,
                                                    Type: 'Person'
                                                }}
                                                title='Personen-Menü'
                                            />

                                            {imageUrl ? (
                                                <img
                                                    src={imageUrl}
                                                    alt=''
                                                />
                                            ) : (
                                                <span>👤</span>
                                            )}
                                        </div>

                                        <strong>
                                            {
                                                person.Name
                                                ?? 'Unbekannt'
                                            }
                                        </strong>

                                        {person.Role && (
                                            <small>
                                                als {person.Role}
                                            </small>
                                        )}
                                    </Link>
                                );
                            })}
                        </MinitigerRail>
                    </section>
                )}

            </main>
        </Page>
    );
};

// MINITIGER_PATCH_MARKER: PHASE_18_12_6C_TEST_SERIES_SWITCHER_ALIGNMENT_RECOVERY
export default MinitigerVideoDetails;

// MINITIGER_PATCH_MARKER: PHASE_18_18_1_SERIES_SEASON_WRAP

// MINITIGER_PATCH_MARKER: PHASE_18_18_1B_VALID_EMPTY_GUID
