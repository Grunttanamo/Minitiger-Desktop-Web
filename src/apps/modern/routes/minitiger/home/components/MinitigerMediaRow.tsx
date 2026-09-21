import type { ApiClient } from 'jellyfin-apiclient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { Link } from 'react-router-dom';

import { playbackManager } from 'components/playback/playbackmanager';
import {
    useToggleFavoriteMutation,
    useTogglePlayedMutation
} from 'hooks/useFetchItems';
import type { ItemDto } from 'types/base/models/item-dto';

import {
    getCardSubtitle,
    getCardTitle,
    getLandscapeImageUrl,
    getLanguageFlagUrl,
    getParentLandscapeImageUrl,
    getPlaybackProgress,
    getPrimaryImageUrl,
    getRatingLabel,
    getStreamLanguages,
    supportsAudioFlags,
    supportsFskBadge
} from '../mediaUtils';
import useMinitigerRowMediaStreams from '../hooks/useMinitigerRowMediaStreams';
import { getItemRoute } from '../routingUtils';
import MinitigerPoster from './MinitigerPoster';

interface MinitigerMediaRowProps {
    title: string;
    items: ItemDto[];
    apiClient?: ApiClient;
    pending?: boolean;
    error?: boolean;
    variant?: 'poster' | 'landscape' | 'square';
    showProgress?: boolean;
    preferParentLandscape?: boolean;
    loadAudioFlags?: boolean;
    showFskBadges?: boolean;
    showPlayedIndicators?: boolean;
    showVirtualAssign?: boolean;
    isVirtuallyAssigned?: (itemId?: string | null) => boolean;
    onVirtualAssign?: (item: ItemDto) => void;
    emptyText?: string;
    previewContext?: string;
    subtitleOverride?: (
        item: ItemDto
    ) => string | null | undefined;
}

const isQuickPlayable = (item: ItemDto) => {
    const mediaType = String(item.MediaType ?? '').toLowerCase();
    const type = String(item.Type ?? '').toLowerCase();

    return (
        mediaType === 'video'
        || mediaType === 'audio'
        || type === 'movie'
        || type === 'series'
        || type === 'episode'
        || type === 'musicvideo'
        || type === 'video'
        || type === 'audio'
    );
};


const getFskClassName = (value?: string | null) => {
    const rating = String(value ?? '');

    if (rating.includes('18')) return 'fsk18';
    if (rating.includes('16')) return 'fsk16';
    if (rating.includes('12')) return 'fsk12';
    if (rating.includes('6')) return 'fsk6';
    if (rating.includes('0')) return 'fsk0';

    return '';
};

const MinitigerMediaRow = ({
    title,
    items,
    apiClient,
    pending = false,
    error = false,
    variant = 'poster',
    showProgress = false,
    preferParentLandscape = false,
    loadAudioFlags = false,
    showFskBadges = true,
    showPlayedIndicators = true,
    showVirtualAssign = false,
    isVirtuallyAssigned,
    onVirtualAssign,
    emptyText,
    previewContext,
    subtitleOverride
}: MinitigerMediaRowProps) => {
    const rowRef = useRef<HTMLDivElement>(null);
    const [ canScroll, setCanScroll ] = useState(false);
    const queryClient = useQueryClient();
    const favoriteMutation = useToggleFavoriteMutation();
    const playedMutation = useTogglePlayedMutation();

    const streamDetails =
        useMinitigerRowMediaStreams(
            items,
            loadAudioFlags
        );

    const currentUserId =
        apiClient?.getCurrentUserId() ?? '';
    const seriesIds = useMemo(
        () => Array.from(new Set(
            items
                .filter(item =>
                    (
                        item.Type === 'Episode'
                        || item.Type === 'Season'
                    )
                    && Boolean(item.SeriesId)
                )
                .map(item => String(item.SeriesId))
        )),
        [items]
    );
    const seriesTitleQuery = useQuery({
        queryKey: [
            'Minitiger',
            'SeriesMainTitles',
            currentUserId,
            seriesIds.join(',')
        ],
        queryFn: async () => {
            if (!apiClient || !currentUserId) {
                return new Map<string, string>();
            }

            const series = await Promise.all(
                seriesIds.map(async seriesId => {
                    try {
                        return await apiClient.getItem(
                            currentUserId,
                            seriesId
                        ) as ItemDto;
                    } catch {
                        return null;
                    }
                })
            );

            return new Map(
                series
                    .filter(
                        (item): item is ItemDto =>
                            Boolean(item?.Id && item.Name)
                    )
                    .map(item => [
                        String(item.Id),
                        String(item.Name)
                    ])
            );
        },
        enabled: Boolean(
            apiClient
            && currentUserId
            && seriesIds.length
        )
    });
    const seriesMainTitles =
        seriesTitleQuery.data;

    const displayItems = useMemo(
        () => items.map(item => {
            const resolvedSeriesName =
                item.SeriesId
                    ? seriesMainTitles?.get(
                        String(item.SeriesId)
                    )
                    : undefined;
            const displayItem = resolvedSeriesName
                ? {
                    ...item,
                    SeriesName: resolvedSeriesName
                }
                : item;
            if (!item.Id) {
                return displayItem;
            }

            const detailed =
                streamDetails?.get(item.Id);

            if (!detailed) {
                return displayItem;
            }

            const mediaStreams =
                detailed.MediaStreams?.length
                    ? detailed.MediaStreams
                    : item.MediaStreams;

            const mediaSources =
                detailed.MediaSources?.length
                    ? detailed.MediaSources
                    : item.MediaSources;

            if (
                !mediaStreams?.length
                && !mediaSources?.length
            ) {
                return item;
            }

            return {
                ...displayItem,
                OfficialRating:
                    detailed.OfficialRating
                    ?? displayItem.OfficialRating,
                MediaStreams: mediaStreams,
                MediaSources: mediaSources
            };
        }),
        [
            items,
            seriesMainTitles,
            streamDetails
        ]
    );

    // MINITIGER_PATCH_MARKER: PHASE_18_18_0_MAIN_TITLE_RESOLUTION

    const updateScrollAvailability = useCallback(() => {
        const row = rowRef.current;

        if (!row) {
            setCanScroll(false);
            return;
        }

        setCanScroll(
            row.scrollWidth > row.clientWidth + 2
        );
    }, []);

    useEffect(() => {
        updateScrollAvailability();

        const row = rowRef.current;
        const observer = row && typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(updateScrollAvailability)
            : null;

        if (row && observer) {
            observer.observe(row);

            Array.from(row.children).forEach(child => {
                if (child instanceof HTMLElement) {
                    observer.observe(child);
                }
            });
        }

        window.addEventListener(
            'resize',
            updateScrollAvailability
        );

        const frame = window.requestAnimationFrame(
            updateScrollAvailability
        );

        return () => {
            window.cancelAnimationFrame(frame);
            observer?.disconnect();
            window.removeEventListener(
                'resize',
                updateScrollAvailability
            );
        };
    }, [
        displayItems.length,
        updateScrollAvailability,
        variant
    ]);

    const scrollRow = (direction: -1 | 1) => {
        const row = rowRef.current;

        if (!row || !canScroll) {
            return;
        }

        row.scrollBy({
            left: direction * Math.max(
                320,
                row.clientWidth * 0.78
            ),
            behavior: 'smooth'
        });
    };

    const quickPlay = (
        event: React.MouseEvent<HTMLButtonElement>,
        item: ItemDto
    ) => {
        event.preventDefault();
        event.stopPropagation();

        playbackManager.play({
            items: [ item ],
            startPositionTicks:
                item.UserData?.PlaybackPositionTicks ?? 0
        }).catch(playbackError => {
            console.error(
                '[Minitiger Card] Wiedergabe fehlgeschlagen',
                playbackError
            );
        });
    };

    const togglePlayed = async (
        event: React.MouseEvent<HTMLButtonElement>,
        item: ItemDto
    ) => {
        event.preventDefault();
        event.stopPropagation();

        if (!item.Id || playedMutation.isPending) {
            return;
        }

        await playedMutation.mutateAsync({
            itemId: item.Id,
            isPlayed: Boolean(item.UserData?.Played)
        });

        await queryClient.invalidateQueries({
            queryKey: [ 'Items' ]
        });
    };

    const toggleFavorite = async (
        event: React.MouseEvent<HTMLButtonElement>,
        item: ItemDto
    ) => {
        event.preventDefault();
        event.stopPropagation();

        if (!item.Id || favoriteMutation.isPending) {
            return;
        }

        await favoriteMutation.mutateAsync({
            itemId: item.Id,
            isFavorite:
                Boolean(item.UserData?.IsFavorite)
        });

        await queryClient.invalidateQueries({
            queryKey: [ 'Items' ]
        });
    };

    const openNativeMenu = async (
        event: React.MouseEvent<HTMLButtonElement>,
        item: ItemDto
    ) => {
        event.preventDefault();
        event.stopPropagation();

        if (!apiClient || !item.Id) {
            return;
        }

        const sourceButton = event.currentTarget;
        const userId = apiClient.getCurrentUserId();

        if (!userId) {
            return;
        }

        try {
            const [
                itemContextMenu,
                detailedItem,
                currentUser
            ] = await Promise.all([
                import('components/itemContextMenu'),
                apiClient.getItem(
                    userId,
                    item.Id
                ) as Promise<ItemDto>,
                apiClient.getCurrentUser()
            ]);

            const result = await itemContextMenu.show({
                item: detailedItem,
                user: currentUser,
                positionTo: sourceButton,
                play: true,
                queue: true,
                shuffle: true,
                playlist: true,
                playAllFromHere:
                    detailedItem.Type === 'Season'
                    || !detailedItem.IsFolder,
                queueAllFromHere:
                    !detailedItem.IsFolder
            });

            if (result?.updated || result?.deleted) {
                await queryClient.invalidateQueries({
                    queryKey: [ 'Items' ]
                });
            }
        } catch (menuError) {
            console.error(
                '[Minitiger Card] Jellyfin-Menü konnte nicht geöffnet werden',
                menuError
            );
        }
    };

    if (!pending && !error && items.length === 0 && !emptyText) {
        return null;
    }

    return (
        <section
            className='minitigerSection minitigerMediaSection'
            data-has-scroll-controls={canScroll}
        >
            <div className='minitigerSectionHeader'>
                <h2
                    style={{
                        '--mt-side-title-size':
                            `${Math.max(
                                0.72,
                                Math.min(
                                    1.18,
                                    1.34 - title.length * 0.018
                                )
                            ).toFixed(2)}rem`
                    } as React.CSSProperties}
                >
                    {title}
                </h2>

                {!pending && !error && canScroll && (
                    <div className='minitigerRowArrows'>
                        <button
                            type='button'
                            onClick={() => scrollRow(-1)}
                            aria-label={
                                `${title} nach links scrollen`
                            }
                        >
                            ‹
                        </button>

                        <button
                            type='button'
                            onClick={() => scrollRow(1)}
                            aria-label={
                                `${title} nach rechts scrollen`
                            }
                        >
                            ›
                        </button>
                    </div>
                )}
            </div>

            {pending && (
                <div className='minitigerStatusCard'>
                    {title} wird geladen …
                </div>
            )}

            {error && (
                <div className='minitigerStatusCard minitigerStatusError'>
                    {title} konnte nicht geladen werden.
                </div>
            )}

            {!pending && !error
                && items.length === 0
                && emptyText
                && (
                    <div className='minitigerStatusCard'>
                        {emptyText}
                    </div>
                )}

            {!pending && !error && items.length > 0 && (
                <div
                    ref={rowRef}
                    className={[
                        'minitigerMediaRow',
                        variant === 'landscape'
                            ? 'minitigerMediaRowLandscape'
                            : ''
                    ].filter(Boolean).join(' ')}
                >
                    {displayItems.map((item) => {
                        const imageUrl =
                            variant === 'landscape'
                                ? (
                                    preferParentLandscape
                                        ? getParentLandscapeImageUrl(
                                            apiClient,
                                            item
                                        )
                                        : getLandscapeImageUrl(
                                            apiClient,
                                            item
                                        )
                                )
                                : getPrimaryImageUrl(
                                    apiClient,
                                    item
                                );

                        const progress = showProgress
                            ? getPlaybackProgress(item)
                            : 0;

                        const unplayed =
                            item.UserData
                                ?.UnplayedItemCount
                            ?? 0;

                        const played =
                            Boolean(item.UserData?.Played);

                        const favorite =
                            Boolean(
                                item.UserData?.IsFavorite
                            );

                        const ratingLabel =
                            showFskBadges
                            && supportsFskBadge(item)
                                ? getRatingLabel(
                                    item.OfficialRating
                                )
                                : null;

                        const audioFlags =
                            loadAudioFlags
                            && supportsAudioFlags(item)
                                ? getStreamLanguages(
                                    item,
                                    'Audio'
                                )
                                    .map(language => ({
                                        language,
                                        url:
                                            getLanguageFlagUrl(
                                                language
                                            )
                                    }))
                                    .filter(flag =>
                                        Boolean(flag.url)
                                    )
                                    .slice(0, 3)
                                : [];

                        const itemRoute =
                            getItemRoute(item);

                        const cardSubtitle =
                            subtitleOverride?.(item)
                            ?? getCardSubtitle(item);

                        const titleRoute =
                            item.Type === 'Episode'
                            && item.SeriesId
                                ? `/minitigerdetails?id=${
                                    encodeURIComponent(
                                        item.SeriesId
                                    )
                                }`
                                : itemRoute;

                        return (
                            <article
                                key={item.Id ?? item.Name}
                                data-minitiger-item-id={
                                    item.Id ?? undefined
                                }
                                data-minitiger-preview-context={
                                    previewContext || undefined
                                }
                                className={[
                                    'minitigerMediaCard',
                                    variant === 'landscape'
                                        ? 'minitigerMediaCardLandscape'
                                        : variant === 'square'
                                            ? 'minitigerMediaCardSquare'
                                            : ''
                                ].filter(Boolean).join(' ')}
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
                                <div className='minitigerMediaCardBody'>
                                    <div
                                        className={[
                                            'minitigerMediaCardVisual',
                                            variant === 'landscape'
                                                ? 'minitigerMediaCardVisualLandscape'
                                                : variant === 'square'
                                                    ? 'minitigerMediaCardVisualSquare'
                                                    : ''
                                        ].filter(Boolean).join(' ')}
                                    >
                                        <Link
                                            className='minitigerMediaPosterLink'
                                            to={itemRoute}
                                            aria-label={
                                                getCardTitle(item)
                                            }
                                        >
                                            <div
                                                className={[
                                                    'minitigerPoster',
                                                    variant
                                                        === 'landscape'
                                                        ? 'minitigerPosterLandscape'
                                                        : variant
                                                            === 'square'
                                                            ? 'minitigerPosterSquare'
                                                            : ''
                                                ]
                                                    .filter(Boolean)
                                                    .join(' ')}
                                            >
                                                <MinitigerPoster
                                                    imageUrl={
                                                        imageUrl
                                                    }
                                                />

                                                <div className='minitigerPosterShade' />

                                                {showProgress
                                                    && progress > 0
                                                    && (
                                                        <div className='minitigerProgressTrack'>
                                                            <div
                                                                className='minitigerProgressValue'
                                                                style={{
                                                                    width:
                                                                        `${progress}%`
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                            </div>
                                        </Link>

                                        <div className='minitigerMediaOverlay'>
                                            {showVirtualAssign
                                                && onVirtualAssign
                                                && item.Id
                                                && (
                                                    String(item.Type ?? '').toLowerCase() === 'series'
                                                    || String(item.Type ?? '').toLowerCase() === 'movie'
                                                )
                                                && (
                                                    <button
                                                        type='button'
                                                        className={[
                                                            'minitigerVirtualQuickAssign',
                                                            isVirtuallyAssigned?.(item.Id)
                                                                ? 'isAssigned'
                                                                : ''
                                                        ].filter(Boolean).join(' ')}
                                                        onClick={event => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            onVirtualAssign(item);
                                                        }}
                                                        title='Virtuelle Bibliotheken verwalten'
                                                        aria-label='Virtuelle Bibliotheken verwalten'
                                                    >
                                                        ⊞
                                                    </button>
                                                )}

                                            {isQuickPlayable(item) && (
                                                <button
                                                    type='button'
                                                    className='minitigerQuickPlay'
                                                    onClick={event =>
                                                        quickPlay(
                                                            event,
                                                            item
                                                        )
                                                    }
                                                    aria-label={
                                                        `${getCardTitle(item)} abspielen`
                                                    }
                                                    title='Abspielen'
                                                >
                                                    ▶
                                                </button>
                                            )}

                                            <div className='minitigerCardActions'>
                                                <button
                                                    type='button'
                                                    className={[
                                                        'minitigerCardAction',
                                                        played
                                                            ? 'isOn'
                                                            : ''
                                                    ]
                                                        .filter(Boolean)
                                                        .join(' ')}
                                                    onClick={event =>
                                                        togglePlayed(
                                                            event,
                                                            item
                                                        )
                                                    }
                                                    title={
                                                        played
                                                            ? 'Als ungesehen markieren'
                                                            : 'Als gesehen markieren'
                                                    }
                                                    aria-label={
                                                        played
                                                            ? 'Als ungesehen markieren'
                                                            : 'Als gesehen markieren'
                                                    }
                                                >
                                                    ✓
                                                </button>

                                                <button
                                                    type='button'
                                                    className={[
                                                        'minitigerCardAction',
                                                        favorite
                                                            ? 'isOn'
                                                            : ''
                                                    ]
                                                        .filter(Boolean)
                                                        .join(' ')}
                                                    onClick={event =>
                                                        toggleFavorite(
                                                            event,
                                                            item
                                                        )
                                                    }
                                                    title='Watchlist'
                                                    aria-label='Watchlist'
                                                >
                                                    {favorite
                                                        ? '♥'
                                                        : '♡'}
                                                </button>

                                                <button
                                                    type='button'
                                                    className='minitigerCardAction minitigerCardMenu'
                                                    onClick={event =>
                                                        openNativeMenu(
                                                            event,
                                                            item
                                                        )
                                                    }
                                                    title='Mehr'
                                                    aria-label='Mehr'
                                                >
                                                    ⋮
                                                </button>
                                            </div>

                                        </div>

                                        {showPlayedIndicators
                                            && (played || unplayed > 0)
                                            && (
                                                <div
                                                    className={[
                                                        'minitigerPlayedCorner',
                                                        played ? 'isComplete' : ''
                                                    ].filter(Boolean).join(' ')}
                                                >
                                                    <span className='minitigerPlayedCornerText'>{played ? '✓' : unplayed}</span>
                                                </div>
                                            )}

                                        <div className='minitigerBadgeLayer minitigerBadgeLayerPermanent'>
                                            <div className='minitigerAudioFlags'>
                                                {audioFlags.map((flag, index) => (
                                                    <img
                                                        key={`${flag.language}-${index}`}
                                                        className='minitigerAudioFlag'
                                                        src={flag.url ?? undefined}
                                                        alt={flag.language}
                                                        title={flag.language}
                                                        onError={event => {
                                                            event.currentTarget.style.display = 'none';
                                                        }}
                                                    />
                                                ))}
                                            </div>

                                            {ratingLabel && (
                                                <span
                                                    className={[
                                                        'minitigerFskBadge',
                                                        getFskClassName(ratingLabel)
                                                    ].filter(Boolean).join(' ')}
                                                >
                                                    {ratingLabel}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className='minitigerMediaInfo'>
                                        <Link
                                            className='minitigerMediaInfoLink minitigerMediaTitleLink'
                                            data-minitiger-no-preview='true'
                                            to={titleRoute}
                                            onClick={event => {
                                                event.stopPropagation();
                                            }}
                                            title={
                                                getCardTitle(
                                                    item
                                                )
                                            }
                                        >
                                            <strong>
                                                {getCardTitle(item)}
                                            </strong>
                                        </Link>

                                        <Link
                                            className='minitigerMediaInfoLink minitigerMediaSubtitleLink'
                                            data-minitiger-no-preview='true'
                                            to={itemRoute}
                                            onClick={event => {
                                                event.stopPropagation();
                                            }}
                                            title={
                                                cardSubtitle
                                            }
                                        >
                                            <span>
                                                {cardSubtitle}
                                            </span>
                                        </Link>
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
};

export default MinitigerMediaRow;

// MINITIGER_PATCH_MARKER: PHASE_18_18_5B_MEDIA_SUBTITLE_OVERRIDE
