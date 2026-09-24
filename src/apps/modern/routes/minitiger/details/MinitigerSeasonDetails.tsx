import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import React, {
    useEffect,
    useMemo
} from 'react';
import { Link } from 'react-router-dom';

import { clearBackdrop } from 'components/backdrop/backdrop';
import Page from 'components/Page';
import { playbackManager } from 'components/playback/playbackmanager';
import { useApi } from 'hooks/useApi';
import { useGetItems } from 'hooks/useFetchItems';
import { useItem } from 'hooks/useItem';
import type { ItemDto } from 'types/base/models/item-dto';

import { isMinitigerAvailableEpisode } from './episodeUtils';
import MinitigerDetailAudioFlags from './MinitigerDetailAudioFlags';

import useMinitigerDetailSettings from '../home/hooks/useMinitigerDetailSettings';
import useMinitigerHomeSettings from '../home/hooks/useMinitigerHomeSettings';
import useMinitigerRowMediaStreams from '../home/hooks/useMinitigerRowMediaStreams';
import useMinitigerThemeVariables from '../home/hooks/useMinitigerThemeVariables';
import {
    getBackdropImageUrl,
    getLandscapeImageUrl,
    getPrimaryImageUrl,
    getRuntimeLabel,
    shortOverview
} from '../home/mediaUtils';
import { getItemRoute } from '../home/routingUtils';

import './MinitigerVideoDetails.scss';

interface Props {
    itemId: string;
}

const MinitigerSeasonDetails = ({
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
        data: fetchedSeason,
        isPending
    } = useItem(itemId);

    const season =
        fetchedSeason as
            ItemDto
            | undefined;

    const {
        data: seriesItem
    } = useItem(
        season?.SeriesId
        ?? undefined
    );

    const {
        data: episodesData,
        isPending:
            episodesPending
    } = useGetItems({
        parentId:
            season?.Id
            ?? undefined,
        recursive: false,
        limit: 500,
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
    }, Boolean(season?.Id));

    const episodes = useMemo(
        () => [
            ...(episodesData?.Items
                ?? [])
        ].filter(isMinitigerAvailableEpisode).sort(
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
            episodesData?.Items
        ]
    );

    const episodeMediaDetails =
        useMinitigerRowMediaStreams(
            episodes,
            homeSettings.showAudioFlags
        );

    useEffect(() => {
        clearBackdrop();
    }, []);

    const playEpisode = (
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
                '[Minitiger Season] Folge konnte nicht abgespielt werden',
                error
            );
        });
    };

    const openEpisodeMenu = async (
        event: React.MouseEvent<HTMLButtonElement>,
        episode: ItemDto
    ) => {
        event.preventDefault();
        event.stopPropagation();

        if (
            !apiClient
            || !episode.Id
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
                item: episode,
                user: currentUser,
                positionTo:
                    event.currentTarget,
                play: true,
                queue: true,
                playlist: true
            });
        } catch (error) {
            console.error(
                '[Minitiger Season] Folgen-Menü konnte nicht geöffnet werden',
                error
            );
        }
    };

    if (
        isPending
        || !season
    ) {
        return (
            <Page
                id='minitigerSeasonDetailsPage'
                className='mainAnimatedPage minitigerVideoDetailsPage'
                isBackButtonEnabled
            >
                <div className='minitigerDetailsLoading'>
                    Staffel wird geladen …
                </div>
            </Page>
        );
    }

    const backdrop =
        getBackdropImageUrl(
            apiClient,
            (seriesItem
                ?? season) as ItemDto
        );

    const poster =
        getPrimaryImageUrl(
            apiClient,
            season
        )
        ?? getPrimaryImageUrl(
            apiClient,
            (seriesItem
                ?? season) as ItemDto
        );

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
            id='minitigerSeasonDetailsPage'
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
                <section className='minitigerDetailsHero minitigerSeasonHero'>
                    <div className='minitigerDetailsPoster'>
                        {poster ? (
                            <img
                                src={poster}
                                alt=''
                            />
                        ) : (
                            <div className='minitigerDetailsPosterFallback'>
                                🐯
                            </div>
                        )}
                    </div>

                    <div className='minitigerSeasonRightColumn'>
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
                                STAFFEL
                            </div>

                            <h1>
                                {
                                    season.Name
                                    ?? `Staffel ${
                                        season.IndexNumber
                                        ?? ''
                                    }`
                                }
                            </h1>

                            <div className='minitigerDetailsMeta'>
                                <span>
                                    {
                                        episodes.length
                                    } Folgen
                                </span>
                            </div>

                            {season.Overview && (
                                <p className='minitigerDetailsOverview'>
                                    {
                                        season.Overview
                                    }
                                </p>
                            )}
                        </div>

                        <section className='minitigerSeasonEmbeddedEpisodes'>
                            <div className='minitigerDetailsSectionHead'>
                                <div>
                                    <h2>Folgen</h2>
                                    <span>
                                        {
                                            episodes.length
                                        }
                                    </span>
                                </div>
                            </div>

                            {episodesPending ? (
                                <div className='minitigerDetailsInlineStatus'>
                                    Folgen werden geladen …
                                </div>
                            ) : (
                                <div className='minitigerSeasonEpisodeList'>
                                    {episodes.map(
                                        episode => {
                                            const image =
                                                getLandscapeImageUrl(
                                                    apiClient,
                                                    episode
                                                );
                                            const audioFlagItem = episode.Id
                                                ? episodeMediaDetails?.get(episode.Id) ?? episode
                                                : episode;

                                            return (
                                                <article
                                                    key={
                                                        episode.Id
                                                        ?? episode.Name
                                                    }
                                                    className='minitigerSeasonEpisodeItem'
                                                >
                                                    <div className='minitigerSeasonEpisodeNumber'>
                                                        {
                                                            episode.IndexNumber
                                                            ?? '•'
                                                        }.
                                                    </div>

                                                    <div className='minitigerSeasonEpisodeImage'>
                                                        <Link
                                                            to={
                                                                getItemRoute(
                                                                    episode
                                                                )
                                                            }
                                                            className='minitigerSeasonEpisodeImageLink'
                                                        >
                                                            {image ? (
                                                                <img
                                                                    src={image}
                                                                    alt=''
                                                                />
                                                            ) : (
                                                                <span />
                                                            )}
                                                        </Link>

                                                        <button
                                                            type='button'
                                                            className='minitigerSeasonEpisodePlay'
                                                            title='Abspielen'
                                                            onClick={
                                                                event =>
                                                                    playEpisode(
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

                                                        {episode.UserData?.Played && (
                                                            <span
                                                                className='minitigerSeasonEpisodeSeen'
                                                                title='Gesehen'
                                                                aria-label='Gesehen'
                                                            >
                                                                ✓
                                                            </span>
                                                        )}
                                                    </div>

                                                    <Link
                                                        to={
                                                            getItemRoute(
                                                                episode
                                                            )
                                                        }
                                                        className='minitigerSeasonEpisodeInfo'
                                                    >
                                                        <strong>
                                                            {
                                                                episode.Name
                                                                ?? 'Episode'
                                                            }
                                                        </strong>

                                                        <p>
                                                            {
                                                                shortOverview(
                                                                    episode.Overview,
                                                                    260
                                                                )
                                                                || 'Keine Beschreibung hinterlegt.'
                                                            }
                                                        </p>
                                                    </Link>

                                                    <strong className='minitigerSeasonEpisodeRuntime'>
                                                        {
                                                            getRuntimeLabel(
                                                                episode.RunTimeTicks
                                                            )
                                                            ?? ''
                                                        }
                                                    </strong>

                                                    <button
                                                        type='button'
                                                        className='minitigerSeasonEpisodeMenu'
                                                        title='Mehr'
                                                        onClick={
                                                            event =>
                                                                openEpisodeMenu(
                                                                    event,
                                                                    episode
                                                                )
                                                        }
                                                    >
                                                        ⋮
                                                    </button>
                                                </article>
                                            );
                                        }
                                    )}
                                </div>
                            )}
                        </section>
                    </div>
                </section>
            </main>
        </Page>
    );
};

export default MinitigerSeasonDetails;
