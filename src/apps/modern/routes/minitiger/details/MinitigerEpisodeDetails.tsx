import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { useQueryClient } from '@tanstack/react-query';
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

import useMinitigerDetailSettings from '../home/hooks/useMinitigerDetailSettings';
import useMinitigerHomeSettings from '../home/hooks/useMinitigerHomeSettings';
import useMinitigerRowMediaStreams from '../home/hooks/useMinitigerRowMediaStreams';
import useMinitigerThemeVariables from '../home/hooks/useMinitigerThemeVariables';
import {
    getBackdropImageUrl,
    getLandscapeImageUrl,
    getRuntimeLabel,
    shortOverview
} from '../home/mediaUtils';
import { getItemRoute } from '../home/routingUtils';

import './MinitigerVideoDetails.scss';

interface Props {
    itemId: string;
}

interface EpisodeMediaStream {
    Index?: number | null;
    Type?: string | null;
    DisplayTitle?: string | null;
    Title?: string | null;
    Language?: string | null;
    Codec?: string | null;
    IsDefault?: boolean | null;
    IsForced?: boolean | null;
}

interface EpisodeMediaSource {
    Id?: string | null;
    Name?: string | null;
    Path?: string | null;
    Container?: string | null;
    MediaStreams?: EpisodeMediaStream[] | null;
}

const getEpisodeStreamLabel = (
    stream: EpisodeMediaStream,
    fallback: string
) => (
    stream.DisplayTitle
    || [
        stream.Language?.toUpperCase(),
        stream.Title,
        stream.Codec?.toUpperCase()
    ].filter(Boolean).join(' · ')
    || fallback
);

const noItemId =
    '00000000000000000000000000000000';

const MinitigerEpisodeDetails = ({
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

    const queryClient =
        useQueryClient();

    const favoriteMutation =
        useToggleFavoriteMutation();

    const playedMutation =
        useTogglePlayedMutation();

    const {
        data: fetchedItem,
        isPending
    } = useItem(itemId);

    const item =
        fetchedItem as
            ItemDto
            | undefined;

    const {
        data: seriesItem
    } = useItem(
        item?.SeriesId
        ?? undefined
    );

    const {
        data: seasonItem
    } = useItem(
        item?.SeasonId
        ?? undefined
    );

    const {
        data: seasonsData,
        isPending: seasonsPending
    } = useGetItems({
        parentId:
            item?.SeriesId
            ?? noItemId,
        recursive: false,
        limit: 100,
        fields: [
            ItemFields.PrimaryImageAspectRatio
        ],
        imageTypeLimit: 1,
        enableImageTypes: [
            ImageType.Primary
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

    const [
        selectedSeasonId,
        setSelectedSeasonId
    ] = useState('');

    useEffect(() => {
        setSelectedSeasonId(
            item?.SeasonId
            ?? ''
        );
    }, [
        item?.Id,
        item?.SeasonId
    ]);

    const selectedSeason = useMemo(
        () => seasons.find(season =>
            season.Id === selectedSeasonId
        ),
        [
            seasons,
            selectedSeasonId
        ]
    );

    const {
        data: siblingsData,
        isPending:
            siblingsPending
    } = useGetItems({
        parentId:
            selectedSeasonId
            || item?.SeasonId
            || noItemId,
        recursive: false,
        limit: 300,
        fields: [
            ItemFields.Overview,
            ItemFields.PrimaryImageAspectRatio,
            ItemFields.MediaSources
        ],
        imageTypeLimit: 3,
        enableImageTypes: [
            ImageType.Primary,
            ImageType.Thumb,
            ImageType.Backdrop
        ],
        enableTotalRecordCount:
            false,
        includeItemTypes: [
            BaseItemKind.Episode
        ]
    });

    const siblings = useMemo(
        () => [
            ...(siblingsData?.Items
                ?? [])
        ]
            .filter(isMinitigerAvailableEpisode)
            .sort(
                (
                    left,
                    right
                ) => (
                    (
                        left.IndexNumber
                        ?? 9999
                    )
                    - (
                        right.IndexNumber
                        ?? 9999
                    )
                )
            ),
        [
            siblingsData?.Items
        ]
    );

    const siblingMediaDetails =
        useMinitigerRowMediaStreams(
            siblings,
            homeSettings.showAudioFlags
        );

    const playbackItem = useMemo(
        () => siblings.find(episode =>
            episode.Id === item?.Id
        ) ?? item,
        [
            item,
            siblings
        ]
    );

    const mediaSources = useMemo(
        () => (
            playbackItem?.MediaSources
            ?? []
        ) as unknown as EpisodeMediaSource[],
        [playbackItem?.MediaSources]
    );

    const [
        mediaSourceId,
        setMediaSourceId
    ] = useState('');

    useEffect(() => {
        if (!mediaSources.length) {
            setMediaSourceId('');
            return;
        }

        if (
            mediaSourceId
            && mediaSources.some(source =>
                source.Id === mediaSourceId
            )
        ) {
            return;
        }

        setMediaSourceId(
            mediaSources[0]?.Id ?? ''
        );
    }, [
        mediaSourceId,
        mediaSources
    ]);

    const selectedMediaSource = useMemo(
        () => mediaSources.find(source =>
            source.Id === mediaSourceId
        ) ?? mediaSources[0],
        [
            mediaSourceId,
            mediaSources
        ]
    );

    const audioTracks = useMemo(
        () => (
            selectedMediaSource?.MediaStreams
            ?? []
        ).filter(stream =>
            String(stream.Type ?? '').toLowerCase() === 'audio'
            && stream.Index != null
        ),
        [selectedMediaSource]
    );

    const subtitleTracks = useMemo(
        () => (
            selectedMediaSource?.MediaStreams
            ?? []
        ).filter(stream =>
            String(stream.Type ?? '').toLowerCase() === 'subtitle'
            && stream.Index != null
        ),
        [selectedMediaSource]
    );

    const [
        audioStreamIndex,
        setAudioStreamIndex
    ] = useState<number | undefined>(undefined);

    const [
        subtitleStreamIndex,
        setSubtitleStreamIndex
    ] = useState(-1);

    useEffect(() => {
        const preferredAudio =
            audioTracks.find(stream => stream.IsDefault)
            ?? audioTracks[0];

        const preferredSubtitle =
            subtitleTracks.find(stream => stream.IsDefault)
            ?? subtitleTracks.find(stream => stream.IsForced);

        setAudioStreamIndex(
            preferredAudio?.Index ?? undefined
        );

        setSubtitleStreamIndex(
            preferredSubtitle?.Index ?? -1
        );
    }, [
        audioTracks,
        subtitleTracks
    ]);

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
                id='minitigerEpisodeDetailsPage'
                className='mainAnimatedPage minitigerVideoDetailsPage'
                isBackButtonEnabled
            >
                <div className='minitigerDetailsLoading'>
                    Folge wird geladen …
                </div>
            </Page>
        );
    }

    const backdrop =
        getBackdropImageUrl(
            apiClient,
            (seriesItem
                ?? item) as ItemDto
        );

    const landscape =
        getLandscapeImageUrl(
            apiClient,
            item
        );

    const play = () => {
        playbackManager.play({
            items: [ item ],
            startPositionTicks:
                item.UserData
                    ?.PlaybackPositionTicks
                ?? 0,
            mediaSourceId:
                selectedMediaSource?.Id
                ?? undefined,
            audioStreamIndex:
                audioStreamIndex
                ?? null,
            subtitleStreamIndex
        }).catch(error => {
            console.error(
                '[Minitiger Episode] Wiedergabe fehlgeschlagen',
                error
            );
        });
    };


    const playSiblingEpisode = (
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
                '[Minitiger Episode] Folgen-Schnellstart fehlgeschlagen',
                error
            );
        });
    };

    const togglePlayed =
        async () => {
            if (
                !item.Id
                || playedMutation
                    .isPending
            ) {
                return;
            }

            await playedMutation
                .mutateAsync({
                    itemId:
                        item.Id,
                    isPlayed:
                        played
                });

            setPlayed(
                !played
            );

            await queryClient
                .invalidateQueries({
                    queryKey:
                        [ 'Items' ]
                });
        };

    const toggleFavorite =
        async () => {
            if (
                !item.Id
                || favoriteMutation
                    .isPending
            ) {
                return;
            }

            await favoriteMutation
                .mutateAsync({
                    itemId:
                        item.Id,
                    isFavorite:
                        favorite
                });

            setFavorite(
                !favorite
            );

            await queryClient
                .invalidateQueries({
                    queryKey:
                        [ 'Items' ]
                });
        };

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
            id='minitigerEpisodeDetailsPage'
            className='mainAnimatedPage minitigerVideoDetailsPage'
            isBackButtonEnabled
            style={detailStyle}
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
                <section className='minitigerDetailsHero isEpisode'>
                    <div className='minitigerEpisodeHeroImage'>
                        {landscape ? (
                            <img
                                src={landscape}
                                alt=''
                            />
                        ) : (
                            <div className='minitigerDetailsPosterFallback'>
                                🐯
                            </div>
                        )}
                    </div>

                    <div className='minitigerDetailsInfo'>
                        {seriesItem?.Name && (
                            <Link
                                className='minitigerDetailsParentTitle'
                                to={getItemRoute(
                                    seriesItem as ItemDto
                                )}
                            >
                                {seriesItem.Name}
                            </Link>
                        )}

                        <div className='minitigerDetailsType'>
                            FOLGE
                        </div>

                        <h1>
                            {
                                item.Name
                                ?? 'Episode'
                            }
                        </h1>

                        <div className='minitigerDetailsMeta'>
                            {[
                                getRuntimeLabel(
                                    item.RunTimeTicks
                                ),
                                seasonItem?.Name
                            ]
                                .filter(
                                    Boolean
                                )
                                .map(
                                    (
                                        value,
                                        index
                                    ) => (
                                        <span
                                            key={
                                                `${value}-${index}`
                                            }
                                        >
                                            {value}
                                        </span>
                                    )
                                )}

                            <MinitigerDetailAudioFlags
                                item={playbackItem}
                                enabled={homeSettings.showAudioFlags}
                                className='isMeta'
                            />
                        </div>

                        {item.Overview && (
                            <p className='minitigerDetailsOverview'>
                                {
                                    item.Overview
                                }
                            </p>
                        )}

                        {(
                            mediaSources.length > 1
                            || audioTracks.length > 1
                            || subtitleTracks.length > 0
                        ) && (
                            <div className='minitigerEpisodeTrackSelectors'>
                                {mediaSources.length > 1 && (
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

                                {audioTracks.length > 1 && (
                                    <div className='minitigerDetailsVersion'>
                                        <span>Audio</span>
                                        <MinitigerSelectDropdown
                                            value={String(audioStreamIndex ?? '')}
                                            ariaLabel='Audio auswählen'
                                            onChange={value =>
                                                setAudioStreamIndex(
                                                    value
                                                        ? Number(value)
                                                        : undefined
                                                )
                                            }
                                            options={audioTracks.map(
                                                (stream, index) => ({
                                                    value: String(
                                                        stream.Index ?? ''
                                                    ),
                                                    label: getEpisodeStreamLabel(
                                                        stream,
                                                        `Audio ${index + 1}`
                                                    )
                                                })
                                            )}
                                        />
                                    </div>
                                )}

                                {subtitleTracks.length > 0 && (
                                    <div className='minitigerDetailsVersion'>
                                        <span>Untertitel</span>
                                        <MinitigerSelectDropdown
                                            value={String(subtitleStreamIndex)}
                                            ariaLabel='Untertitel auswählen'
                                            onChange={value =>
                                                setSubtitleStreamIndex(
                                                    Number(value)
                                                )
                                            }
                                            options={[
                                                {
                                                    value: '-1',
                                                    label: 'Aus'
                                                },
                                                ...subtitleTracks.map(
                                                    (stream, index) => ({
                                                        value: String(
                                                            stream.Index ?? -1
                                                        ),
                                                        label: getEpisodeStreamLabel(
                                                            stream,
                                                            `Untertitel ${index + 1}`
                                                        )
                                                    })
                                                )
                                            ]}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <div className='minitigerDetailsActions'>
                            <button
                                type='button'
                                className='isPrimary'
                                onClick={play}
                            >
                                ▶ Abspielen
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

                            <MinitigerItemMenuButton
                                apiClient={apiClient}
                                item={item}
                                placement='action'
                                title='Folgen-Menü'
                            />
                        </div>
                    </div>
                </section>

                <section className='minitigerDetailsSection minitigerEpisodeSiblingSection'>
                    <div className='minitigerDetailsSectionHead'>
                        <div>
                            <h2>
                                Mehr von {
                                    selectedSeason?.Name
                                    ?? seasonItem?.Name
                                    ?? 'dieser Staffel'
                                }
                            </h2>
                            <span>
                                {
                                    siblings.length
                                } Folgen
                            </span>
                        </div>

                        {seasons.length > 0 && (
                            <MinitigerSeasonSwitcher
                                seasons={seasons}
                                value={
                                    selectedSeasonId
                                    || item.SeasonId
                                    || ''
                                }
                                onChange={setSelectedSeasonId}
                                disabled={seasonsPending}
                                ariaLabel='Staffel auswählen'
                            />
                        )}
                    </div>

                    {siblingsPending ? (
                        <div className='minitigerDetailsInlineStatus'>
                            Folgen werden geladen …
                        </div>
                    ) : (
                        <MinitigerRail
                            className='minitigerDetailsEpisodeRow'
                            ariaLabel='Weitere Folgen'
                        >
                            {siblings.map(
                                episode => {
                                    const image =
                                        getLandscapeImageUrl(
                                            apiClient,
                                            episode
                                        );
                                    const audioFlagItem = episode.Id
                                        ? siblingMediaDetails?.get(episode.Id) ?? episode
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
                                                {image ? (
                                                    <img
                                                        src={image}
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
                                                        playSiblingEpisode(
                                                            event,
                                                            episode
                                                        )
                                                    }
                                                >
                                                    ▶
                                                </button>

                                                <MinitigerDetailAudioFlags
                                                    item={audioFlagItem}
                                                    enabled={homeSettings.showAudioFlags}
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
                                }
                            )}
                        </MinitigerRail>
                    )}
                </section>
            </main>
        </Page>
    );
};

export default MinitigerEpisodeDetails;

// MINITIGER_PATCH_MARKER: PHASE_18_18_1B_VALID_EMPTY_GUID
