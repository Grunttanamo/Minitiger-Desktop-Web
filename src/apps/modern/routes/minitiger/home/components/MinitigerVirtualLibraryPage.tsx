import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from 'jellyfin-apiclient';
import React, {
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

import type { MinitigerVirtualLibrary } from '../config/virtualLibraries';
import useMinitigerHomeSettings from '../hooks/useMinitigerHomeSettings';
import useMinitigerLibrarySettings from '../hooks/useMinitigerLibrarySettings';
import useMinitigerRowMediaStreams from '../hooks/useMinitigerRowMediaStreams';
import {
    getCardSubtitle,
    getCardTitle,
    getLandscapeImageUrl,
    getLanguageFlagUrl,
    getPrimaryImageUrl,
    getRatingLabel,
    getStreamLanguages,
    supportsAudioFlags,
    supportsFskBadge
} from '../mediaUtils';
import { getItemRoute } from '../routingUtils';
import MinitigerPoster from './MinitigerPoster';

interface MinitigerVirtualLibraryPageProps {
    library: MinitigerVirtualLibrary;
    apiClient?: ApiClient;
    isAdmin: boolean;
    isAssigned: (itemId?: string | null) => boolean;
    onAssign: (item: ItemDto) => void;
}

type VirtualTypeFilter = 'all' | 'series' | 'movie' | 'other';

type AzDockPhase = 'top' | 'rolling' | 'side';

const LETTERS = [
    'Alle', '0-9',
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
];

const VIRTUAL_ITEM_CHUNK_SIZE = 40;
const VIRTUAL_ITEM_CONCURRENCY = 3;

const startsWithLetter = (name: string, letter: string) => {
    if (letter === 'Alle') return true;
    const first = name.trim().charAt(0).toUpperCase();
    if (letter === '0-9') return /[0-9]/.test(first);
    return first === letter;
};

const matchesType = (item: ItemDto, filter: VirtualTypeFilter) => {
    if (filter === 'all') return true;
    const type = String(item.Type ?? '').toLowerCase();
    if (filter === 'series') return type === 'series';
    if (filter === 'movie') return type === 'movie';
    return type !== 'series' && type !== 'movie';
};

const chunkIds = (ids: string[]) => {
    const chunks: string[][] = [];

    for (let index = 0; index < ids.length; index += VIRTUAL_ITEM_CHUNK_SIZE) {
        chunks.push(ids.slice(index, index + VIRTUAL_ITEM_CHUNK_SIZE));
    }

    return chunks;
};

const getIdsFingerprint = (ids: string[]) => {
    let hash = 2166136261;

    for (const id of ids) {
        for (let index = 0; index < id.length; index += 1) {
            hash ^= id.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
    }

    return `${ids.length}:${(hash >>> 0).toString(36)}`;
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

const MinitigerVirtualLibraryPage = ({
    library,
    apiClient,
    isAdmin,
    isAssigned,
    onAssign
}: MinitigerVirtualLibraryPageProps) => {
    const [ letter, setLetter ] = useState('Alle');
    const [ typeFilter, setTypeFilter ] = useState<VirtualTypeFilter>('all');
    const [ azDockPhase, setAzDockPhase ] = useState<AzDockPhase>('top');
    const pageRef = useRef<HTMLDivElement>(null);
    const azDockTimer = useRef<number | null>(null);

    const queryClient = useQueryClient();
    const favoriteMutation = useToggleFavoriteMutation();
    const playedMutation = useTogglePlayedMutation();

    const { settings: homeSettings } = useMinitigerHomeSettings();
    const { settings: librarySettings } = useMinitigerLibrarySettings();

    const userId = apiClient?.getCurrentUserId() ?? '';
    const idsFingerprint = useMemo(
        () => getIdsFingerprint(library.itemIds),
        [library.itemIds]
    );

    const itemsQuery = useQuery({
        queryKey: [
            'Minitiger',
            'VirtualLibraryItems',
            apiClient?.serverId() ?? 'server',
            userId,
            library.id,
            idsFingerprint
        ],
        queryFn: async () => {
            if (!apiClient || !userId || library.itemIds.length === 0) {
                return [] as ItemDto[];
            }

            const chunks = chunkIds(library.itemIds);
            const loaded: ItemDto[] = [];

            for (
                let index = 0;
                index < chunks.length;
                index += VIRTUAL_ITEM_CONCURRENCY
            ) {
                const group = chunks.slice(
                    index,
                    index + VIRTUAL_ITEM_CONCURRENCY
                );

                const results = await Promise.all(
                    group.map(async ids => {
                        const result = await apiClient.getItems(
                            userId,
                            {
                                Ids: ids.join(','),
                                Recursive: false,
                                Limit: ids.length,
                                Fields: 'Overview,PrimaryImageAspectRatio,SortName,MediaSources,MediaStreams',
                                ImageTypeLimit: 1,
                                EnableImageTypes: 'Primary,Thumb,Backdrop',
                                EnableTotalRecordCount: false,
                                IncludeItemTypes: 'Movie,Series,BoxSet,Book,MusicVideo,Video'
                            }
                        );

                        return (result?.Items ?? []) as ItemDto[];
                    })
                );

                results.forEach(resultItems => loaded.push(...resultItems));
            }

            const byId = new Map<string, ItemDto>();

            loaded.forEach(item => {
                if (item.Id) {
                    byId.set(item.Id, item);
                }
            });

            return Array.from(byId.values());
        },
        enabled: Boolean(
            apiClient
            && userId
            && library.itemIds.length > 0
        ),
        staleTime: 10 * 60_000,
        gcTime: 30 * 60_000,
        retry: 1
    });

    const rawItems = useMemo(
        () => [ ...(itemsQuery.data ?? []) ],
        [itemsQuery.data]
    );

    const streamDetails = useMinitigerRowMediaStreams(
        rawItems,
        homeSettings.showAudioFlags || homeSettings.showFskBadges
    );

    const enhancedItems = useMemo(
        () => rawItems.map(item => {
            if (!item.Id) {
                return item;
            }

            const detailed = streamDetails?.get(item.Id);

            if (!detailed) {
                return item;
            }

            return {
                ...item,
                OfficialRating: detailed.OfficialRating ?? item.OfficialRating,
                MediaStreams: detailed.MediaStreams?.length
                    ? detailed.MediaStreams
                    : item.MediaStreams,
                MediaSources: detailed.MediaSources?.length
                    ? detailed.MediaSources
                    : item.MediaSources
            };
        }),
        [rawItems, streamDetails]
    );

    const isPending = library.itemIds.length > 0 && itemsQuery.isPending;
    const isError = library.itemIds.length > 0 && itemsQuery.isError;

    const items = useMemo(() => (
        enhancedItems
            .filter(item => startsWithLetter(
                item.SortName ?? item.Name ?? '',
                letter
            ))
            .filter(item => matchesType(item, typeFilter))
            .sort((left, right) => (
                (left.SortName ?? left.Name ?? '')
                    .localeCompare(
                        right.SortName ?? right.Name ?? '',
                        'de'
                    )
            ))
    ), [
        enhancedItems,
        letter,
        typeFilter
    ]);

    useEffect(() => {
        const clearDockTimer = () => {
            if (azDockTimer.current != null) {
                window.clearTimeout(azDockTimer.current);
                azDockTimer.current = null;
            }
        };

        if (librarySettings.azMode === 'side') {
            clearDockTimer();
            setAzDockPhase('side');
            return;
        }

        if (librarySettings.azMode === 'top') {
            clearDockTimer();
            setAzDockPhase('top');
            return;
        }

        const getCurrentScrollTop = (eventTarget?: EventTarget | null) => {
            let scrollTop = Math.max(
                window.scrollY,
                document.documentElement.scrollTop,
                document.body.scrollTop
            );

            if (eventTarget instanceof HTMLElement) {
                scrollTop = Math.max(scrollTop, eventTarget.scrollTop);
            }

            const page = pageRef.current;

            if (page) {
                scrollTop = Math.max(scrollTop, page.scrollTop);

                page.querySelectorAll<HTMLElement>(
                    '.smoothScrollY, .scrollY, .emby-scroller, [data-scrollable="true"]'
                ).forEach(element => {
                    scrollTop = Math.max(scrollTop, element.scrollTop);
                });
            }

            let parent = page?.parentElement;
            let depth = 0;

            while (parent && depth < 10) {
                scrollTop = Math.max(scrollTop, parent.scrollTop);
                parent = parent.parentElement;
                depth += 1;
            }

            return scrollTop;
        };

        const setDocked = (docked: boolean) => {
            if (!docked) {
                clearDockTimer();
                setAzDockPhase('top');
                return;
            }

            setAzDockPhase(current => {
                if (current === 'side' || current === 'rolling') {
                    return current;
                }

                clearDockTimer();
                azDockTimer.current = window.setTimeout(() => {
                    setAzDockPhase('side');
                    azDockTimer.current = null;
                }, 240);

                return 'rolling';
            });
        };

        const onScroll = (event?: Event) => {
            const eventElement = event?.target instanceof Element
                ? event.target
                : null;

            if (eventElement?.closest(
                '.minitigerSettingsOverlay, .minitigerSettingsPanel, .minitigerSettingsScroll'
            )) {
                return;
            }

            setDocked(getCurrentScrollTop(event?.target) > 4);
        };

        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        document.addEventListener('scroll', onScroll, true);

        const watchScroll = window.setInterval(
            () => onScroll(),
            160
        );

        return () => {
            clearDockTimer();
            window.clearInterval(watchScroll);
            window.removeEventListener('scroll', onScroll);
            document.removeEventListener('scroll', onScroll, true);
        };
    }, [librarySettings.azMode]);

    const quickPlay = (
        event: React.MouseEvent<HTMLButtonElement>,
        item: ItemDto
    ) => {
        event.preventDefault();
        event.stopPropagation();

        playbackManager.play({
            items: [ item ],
            startPositionTicks: item.UserData?.PlaybackPositionTicks ?? 0
        }).catch(playbackError => {
            console.error(
                '[Minitiger Virtual] Wiedergabe fehlgeschlagen',
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

        await Promise.all([
            queryClient.invalidateQueries({ queryKey: [ 'Items' ] }),
            itemsQuery.refetch()
        ]);
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
            isFavorite: Boolean(item.UserData?.IsFavorite)
        });

        await Promise.all([
            queryClient.invalidateQueries({ queryKey: [ 'Items' ] }),
            itemsQuery.refetch()
        ]);
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

        try {
            const [
                itemContextMenu,
                detailedItem,
                currentUser
            ] = await Promise.all([
                import('components/itemContextMenu'),
                apiClient.getItem(userId, item.Id) as Promise<ItemDto>,
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
                queueAllFromHere: !detailedItem.IsFolder
            });

            if (result?.updated || result?.deleted) {
                await itemsQuery.refetch();
            }
        } catch (menuError) {
            console.error(
                '[Minitiger Virtual] Jellyfin-Menü konnte nicht geöffnet werden',
                menuError
            );
        }
    };

    return (
        <div ref={pageRef} className='minitigerVirtualPage'>
            <div className='minitigerVirtualPageHead'>
                <div>
                    <Link to='/home' className='minitigerVirtualBack'>
                        ← Startseite
                    </Link>
                    <h1>{library.name}</h1>
                </div>

                <span>{items.length} Inhalte</span>
            </div>

            <div
                className={[
                    'minitigerVirtualToolbar',
                    azDockPhase === 'rolling' ? 'isDocking' : '',
                    azDockPhase === 'side' ? 'isDockedSide' : ''
                ].filter(Boolean).join(' ')}
            >
                <div className='minitigerVirtualLetters'>
                    {LETTERS.map(value => (
                        <button
                            key={value}
                            type='button'
                            className={letter === value ? 'isActive' : ''}
                            onClick={() => setLetter(value)}
                        >
                            {value}
                        </button>
                    ))}
                </div>

                <select
                    value={typeFilter}
                    onChange={event => setTypeFilter(
                        event.currentTarget.value as VirtualTypeFilter
                    )}
                    aria-label='Typ filtern'
                >
                    <option value='all'>Alle Typen</option>
                    <option value='series'>Serien</option>
                    <option value='movie'>Filme</option>
                    <option value='other'>Sonstige</option>
                </select>
            </div>

            {isPending && (
                <div className='minitigerStatusCard'>
                    Virtuelle Bibliothek wird geladen …
                </div>
            )}

            {isError && (
                <div className='minitigerStatusCard minitigerStatusError'>
                    Virtuelle Bibliothek konnte nicht geladen werden.
                </div>
            )}

            {!isPending && !isError && items.length === 0 && (
                <div className='minitigerStatusCard'>
                    Keine passenden Inhalte vorhanden.
                </div>
            )}

            {!isPending && !isError && items.length > 0 && (
                <div
                    className={[
                        'minitigerVirtualGrid',
                        library.display === 'landscape'
                            ? 'isLandscape'
                            : ''
                    ].filter(Boolean).join(' ')}
                >
                    {items.map(item => {
                        const isLandscape = library.display === 'landscape';
                        const imageUrl = isLandscape
                            ? getLandscapeImageUrl(apiClient, item)
                            : getPrimaryImageUrl(apiClient, item);
                        const played = Boolean(item.UserData?.Played);
                        const unplayed = item.UserData?.UnplayedItemCount ?? 0;
                        const favorite = Boolean(item.UserData?.IsFavorite);
                        const ratingLabel = homeSettings.showFskBadges
                            && supportsFskBadge(item)
                            ? getRatingLabel(item.OfficialRating)
                            : null;
                        const audioFlags = homeSettings.showAudioFlags
                            && supportsAudioFlags(item)
                            ? getStreamLanguages(item, 'Audio')
                                .map(language => ({
                                    language,
                                    url: getLanguageFlagUrl(language)
                                }))
                                .filter(flag => Boolean(flag.url))
                                .slice(0, 4)
                            : [];
                        const itemRoute = getItemRoute(item);

                        return (
                            <article
                                key={item.Id ?? item.Name}
                                className={[
                                    'minitigerMediaCard',
                                    'minitigerVirtualItemCard',
                                    isLandscape
                                        ? 'minitigerMediaCardLandscape'
                                        : ''
                                ].filter(Boolean).join(' ')}
                                data-minitiger-item-id={item.Id ?? undefined}
                                data-minitiger-preview-context='virtual-library'
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
                                            'minitigerVirtualItemVisual',
                                            isLandscape
                                                ? 'minitigerMediaCardVisualLandscape'
                                                : ''
                                        ].filter(Boolean).join(' ')}
                                    >
                                        <Link
                                            className='minitigerMediaPosterLink'
                                            to={itemRoute}
                                            aria-label={getCardTitle(item)}
                                        >
                                            <div
                                                className={[
                                                    'minitigerPoster',
                                                    isLandscape
                                                        ? 'minitigerPosterLandscape'
                                                        : ''
                                                ].filter(Boolean).join(' ')}
                                            >
                                                <MinitigerPoster imageUrl={imageUrl} />
                                                <div className='minitigerPosterShade' />
                                            </div>
                                        </Link>

                                        <div className='minitigerMediaOverlay'>
                                            {isAdmin && item.Id && (
                                                <button
                                                    type='button'
                                                    className={[
                                                        'minitigerVirtualQuickAssign',
                                                        isAssigned(item.Id)
                                                            ? 'isAssigned'
                                                            : ''
                                                    ].filter(Boolean).join(' ')}
                                                    onClick={event => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        onAssign(item);
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
                                                    onClick={event => quickPlay(event, item)}
                                                    aria-label={`${getCardTitle(item)} abspielen`}
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
                                                        played ? 'isOn' : ''
                                                    ].filter(Boolean).join(' ')}
                                                    onClick={event => void togglePlayed(event, item)}
                                                    title={played
                                                        ? 'Als ungesehen markieren'
                                                        : 'Als gesehen markieren'}
                                                    aria-label={played
                                                        ? 'Als ungesehen markieren'
                                                        : 'Als gesehen markieren'}
                                                >
                                                    ✓
                                                </button>

                                                <button
                                                    type='button'
                                                    className={[
                                                        'minitigerCardAction',
                                                        favorite ? 'isOn' : ''
                                                    ].filter(Boolean).join(' ')}
                                                    onClick={event => void toggleFavorite(event, item)}
                                                    title='Watchlist'
                                                    aria-label='Watchlist'
                                                >
                                                    {favorite ? '♥' : '♡'}
                                                </button>

                                                <button
                                                    type='button'
                                                    className='minitigerCardAction minitigerCardMenu'
                                                    onClick={event => void openNativeMenu(event, item)}
                                                    title='Mehr'
                                                    aria-label='Mehr'
                                                >
                                                    ⋮
                                                </button>
                                            </div>
                                        </div>

                                        {homeSettings.showPlayedIndicators
                                            && (played || unplayed > 0)
                                            && (
                                                <div
                                                    className={[
                                                        'minitigerPlayedCorner',
                                                        played ? 'isComplete' : ''
                                                    ].filter(Boolean).join(' ')}
                                                >
                                                    <span className='minitigerPlayedCornerText'>
                                                        {played ? '✓' : unplayed}
                                                    </span>
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

                                    <Link
                                        className='minitigerMediaInfoLink'
                                        to={itemRoute}
                                    >
                                        <div className='minitigerMediaInfo'>
                                            <strong>{getCardTitle(item)}</strong>
                                            <span>{getCardSubtitle(item)}</span>
                                        </div>
                                    </Link>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MinitigerVirtualLibraryPage;
