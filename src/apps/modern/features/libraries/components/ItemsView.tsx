import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { SortOrder } from '@jellyfin/sdk/lib/generated-client/models/sort-order';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import classNames from 'classnames';
import React, {
    type FC,
    SetStateAction,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { useNavigate } from 'react-router-dom';

import { useLibrary } from 'apps/modern/features/libraries/hooks/useLibrary';
import MinitigerVirtualAssignModal from 'apps/modern/routes/minitiger/home/components/MinitigerVirtualAssignModal';
import useMinitigerHomeSettings from 'apps/modern/routes/minitiger/home/hooks/useMinitigerHomeSettings';
import useMinitigerLibrarySettings from 'apps/modern/routes/minitiger/home/hooks/useMinitigerLibrarySettings';
import useMinitigerRowMediaStreams from 'apps/modern/routes/minitiger/home/hooks/useMinitigerRowMediaStreams';
import useMinitigerThemeVariables from 'apps/modern/routes/minitiger/home/hooks/useMinitigerThemeVariables';
import useMinitigerVirtualLibraries from 'apps/modern/routes/minitiger/home/hooks/useMinitigerVirtualLibraries';
import { getDefaultLibraryViewSettings } from 'apps/modern/features/libraries/utils/settings';
import Cards from 'components/cardbuilder/Card/Cards';
import { CardShape } from 'components/cardbuilder/utils/shape';
import NoItemsMessage from 'components/common/NoItemsMessage';
import Lists from 'components/listview/List/Lists';
import Loading from 'components/loading/LoadingComponent';
import { ItemAction } from 'constants/itemAction';
import ItemsContainer from 'elements/emby-itemscontainer/ItemsContainer';
import { useApi } from 'hooks/useApi';
import { useUserSettings } from 'hooks/useUserSettings';
import type { CardOptions } from 'types/cardOptions';
import type { ItemDto } from 'types/base/models/item-dto';
import {
    type LibraryViewSettings,
    ViewMode
} from 'types/library';
import { LibraryTab } from 'types/libraryTab';
import type { ListOptions } from 'types/listOptions';

import 'apps/modern/routes/minitiger/home/MinitigerHome.scss';

import AlphabetPicker from './AlphabetPicker';
import FilterButton from './filter/FilterButton';
import Pagination from './Pagination';

const LETTER_VALUES = [
    '#',
    'A', 'B', 'C', 'D', 'E', 'F', 'G',
    'H', 'I', 'J', 'K', 'L', 'M', 'N',
    'O', 'P', 'Q', 'R', 'S', 'T', 'U',
    'V', 'W', 'X', 'Y', 'Z'
];

type SortCode =
    | 'SortNameAsc'
    | 'SortNameDesc'
    | 'YearDesc'
    | 'YearAsc'
    | 'DateCreatedDesc'
    | 'DateCreatedAsc'
    | 'RatingDesc'
    | 'RatingAsc';

const parseSortCode = (
    value: string
): SortCode => {
    switch (value) {
        case 'SortNameDesc':
        case 'YearDesc':
        case 'YearAsc':
        case 'DateCreatedDesc':
        case 'DateCreatedAsc':
        case 'RatingDesc':
        case 'RatingAsc':
            return value;
        case 'SortNameAsc':
        default:
            return 'SortNameAsc';
    }
};

const getSortCode = (
    settings: LibraryViewSettings
): SortCode => {
    const sortBy = settings.SortBy[0];
    const descending =
        settings.SortOrder === SortOrder.Descending;

    if (sortBy === ItemSortBy.ProductionYear) {
        return descending ? 'YearDesc' : 'YearAsc';
    }

    if (sortBy === ItemSortBy.DateCreated) {
        return descending
            ? 'DateCreatedDesc'
            : 'DateCreatedAsc';
    }

    if (sortBy === ItemSortBy.CommunityRating) {
        return descending ? 'RatingDesc' : 'RatingAsc';
    }

    return descending ? 'SortNameDesc' : 'SortNameAsc';
};

const applySort = (
    code: SortCode,
    setLibraryViewSettings: React.Dispatch<
        React.SetStateAction<LibraryViewSettings>
    >
) => {
    const map: Record<
        SortCode,
        {
            sortBy: ItemSortBy;
            sortOrder: SortOrder;
        }
    > = {
        SortNameAsc: {
            sortBy: ItemSortBy.SortName,
            sortOrder: SortOrder.Ascending
        },
        SortNameDesc: {
            sortBy: ItemSortBy.SortName,
            sortOrder: SortOrder.Descending
        },
        YearDesc: {
            sortBy: ItemSortBy.ProductionYear,
            sortOrder: SortOrder.Descending
        },
        YearAsc: {
            sortBy: ItemSortBy.ProductionYear,
            sortOrder: SortOrder.Ascending
        },
        DateCreatedDesc: {
            sortBy: ItemSortBy.DateCreated,
            sortOrder: SortOrder.Descending
        },
        DateCreatedAsc: {
            sortBy: ItemSortBy.DateCreated,
            sortOrder: SortOrder.Ascending
        },
        RatingDesc: {
            sortBy: ItemSortBy.CommunityRating,
            sortOrder: SortOrder.Descending
        },
        RatingAsc: {
            sortBy: ItemSortBy.CommunityRating,
            sortOrder: SortOrder.Ascending
        }
    };

    const next = map[code];

    setLibraryViewSettings(previous => ({
        ...previous,
        StartIndex: 0,
        SortBy: [ next.sortBy ],
        SortOrder: next.sortOrder
    }));
};

const ItemsView: FC = () => {
    const navigate = useNavigate();

    const {
        id: parentId,
        collectionType,
        content,
        itemsResult,
        viewSettings,
        setViewSettings
    } = useLibrary();

    const {
        settings: minitigerLibrarySettings
    } = useMinitigerLibrarySettings();

    const {
        settings: minitigerHomeSettings
    } = useMinitigerHomeSettings();

    useMinitigerThemeVariables(
        minitigerHomeSettings
    );

    const {
        config: virtualConfig,
        setItemMembership
    } = useMinitigerVirtualLibraries();

    const [
        assignTarget,
        setAssignTarget
    ] = useState<ItemDto | null>(null);

    const viewType =
        content?.viewType ?? LibraryTab.Movies;

    const libraryViewSettings =
        viewSettings ?? getDefaultLibraryViewSettings(viewType);

    const setLibraryViewSettings = useMemo(
        () => setViewSettings ?? (
            (_action: SetStateAction<LibraryViewSettings>) => {
                // no-op
            }
        ),
        [setViewSettings]
    );

    const {
        isAlphabetPickerEnabled,
        noItemsMessage,
        itemType,
        isBtnFilterEnabled,
        isPaginationEnabled
    } = content ?? {};

    const isAlphabetPickerSupported = useMediaQuery(t => [
        `${t.breakpoints.down('sm')} and (min-height: 575px)`,
        `(min-width: ${t.breakpoints.values.sm}px) and (min-height: 610px)`
    ].join(', '));

    const {
        __legacyApiClient__,
        user
    } = useApi();

    const {
        libraryPageSize: paginationLimit
    } = useUserSettings();

    const rawItems =
        (itemsResult?.data?.Items ?? []) as ItemDto[];

    const streamDetails =
        useMinitigerRowMediaStreams(
            rawItems,
            minitigerHomeSettings.showAudioFlags
            || minitigerHomeSettings.showFskBadges
        );

    const enhancedItems = useMemo(
        () => rawItems.map(item => {
            if (!item.Id) {
                return item;
            }

            const detailed =
                streamDetails?.get(item.Id);

            if (!detailed) {
                return item;
            }

            return {
                ...item,
                OfficialRating:
                    detailed.OfficialRating
                    ?? item.OfficialRating,
                MediaStreams:
                    detailed.MediaStreams?.length
                        ? detailed.MediaStreams
                        : item.MediaStreams,
                MediaSources:
                    detailed.MediaSources?.length
                        ? detailed.MediaSources
                        : item.MediaSources
            };
        }),
        [
            rawItems,
            streamDetails
        ]
    );

    const isAdmin =
        Boolean(user?.Policy?.IsAdministrator);

    const isVirtuallyAssigned = (
        itemId?: string | null
    ) => (
        Boolean(itemId)
        && virtualConfig.libraries.some(
            library =>
                library.itemIds.includes(
                    itemId ?? ''
                )
        )
    );

    const [ azDockPhase, setAzDockPhase ] = useState<
        'top' | 'rolling' | 'side'
    >('top');

    const azDockTimer = useRef<number | null>(null);

    useEffect(() => {
        const clearDockTimer = () => {
            if (azDockTimer.current != null) {
                window.clearTimeout(azDockTimer.current);
                azDockTimer.current = null;
            }
        };

        if (!minitigerLibrarySettings.customNavigationEnabled) {
            clearDockTimer();
            setAzDockPhase('top');
            return;
        }

        if (minitigerLibrarySettings.azMode === 'side') {
            clearDockTimer();
            setAzDockPhase('side');
            return;
        }

        if (minitigerLibrarySettings.azMode === 'top') {
            clearDockTimer();
            setAzDockPhase('top');
            return;
        }

        const getCurrentScrollTop = (
            eventTarget?: EventTarget | null
        ) => {
            let scrollTop = Math.max(
                window.scrollY,
                document.documentElement.scrollTop,
                document.body.scrollTop
            );

            if (eventTarget instanceof HTMLElement) {
                scrollTop = Math.max(
                    scrollTop,
                    eventTarget.scrollTop
                );
            }

            /* Jellyfin Desktop can move the page inside a nested scroller
               without updating window.scrollY. Inspect both the active page
               ancestry and the known scroll containers so auto docking also
               reacts inside the desktop client. */
            const libraryPage =
                document.querySelector<HTMLElement>(
                    '.minitigerLibraryPage'
                );

            if (libraryPage) {
                scrollTop = Math.max(
                    scrollTop,
                    libraryPage.scrollTop
                );

                libraryPage.querySelectorAll<HTMLElement>(
                    '.smoothScrollY, .scrollY, .emby-scroller, [data-scrollable="true"]'
                ).forEach(element => {
                    scrollTop = Math.max(
                        scrollTop,
                        element.scrollTop
                    );
                });
            }

            let parent = libraryPage?.parentElement;
            let depth = 0;

            while (parent && depth < 10) {
                scrollTop = Math.max(
                    scrollTop,
                    parent.scrollTop
                );
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

            setDocked(
                getCurrentScrollTop(event?.target) > 4
            );
        };

        onScroll();
        window.addEventListener('scroll', onScroll, {
            passive: true
        });
        document.addEventListener(
            'scroll',
            onScroll,
            true
        );

        /* Some Jellyfin views only update the inner scroller between native
           scroll events. A tiny polling fallback keeps the docking state in
           sync without depending on a specific Jellyfin DOM implementation. */
        const watchScroll = window.setInterval(
            () => onScroll(),
            120
        );

        return () => {
            clearDockTimer();
            window.clearInterval(watchScroll);
            window.removeEventListener('scroll', onScroll);
            document.removeEventListener(
                'scroll',
                onScroll,
                true
            );
        };
    }, [
        minitigerLibrarySettings.azMode,
        minitigerLibrarySettings.customNavigationEnabled
    ]);

    useEffect(() => {
        const onCardClick = (
            event: MouseEvent
        ) => {
            const target =
                event.target as
                    HTMLElement
                    | null;

            const card =
                target?.closest(
                    '.minitigerNativeLibraryCard'
                ) as
                    HTMLElement
                    | null;

            if (!card) {
                return;
            }

            if (
                target?.closest(
                    'button, select, input, textarea, [role="button"]'
                )
            ) {
                return;
            }

            const id =
                card.dataset.id;

            const type =
                String(
                    card.dataset.type
                    ?? ''
                ).toLowerCase();

            const context =
                String(
                    card.dataset.context
                    ?? collectionType
                    ?? ''
                ).toLowerCase();

            const directTypes = [
                'series',
                'movie',
                'season',
                'episode',
                'musicartist',
                'musicalbum',
                'musicvideo',
                'book'
            ];

            const specialFolder =
                (
                    type === 'folder'
                    || type === 'boxset'
                )
                && (
                    context === 'books'
                    || context === 'musicvideos'
                );

            if (
                !id
                || (
                    !directTypes.includes(
                        type
                    )
                    && !specialFolder
                )
            ) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            navigate(
                `/minitigerdetails?id=${
                    encodeURIComponent(id)
                }&mtcontext=${
                    encodeURIComponent(context)
                }`
            );
        };

        document.addEventListener(
            'click',
            onCardClick,
            true
        );

        return () => {
            document.removeEventListener(
                'click',
                onCardClick,
                true
            );
        };
    }, [
        collectionType,
        navigate
    ]);

    const allItemsQueryKey = useMemo(
        () => [ 'User', user?.Id, 'Items' ],
        [user?.Id]
    );

    const allViewsQueryKey = useMemo(
        () => [
            ...allItemsQueryKey,
            parentId,
            'ViewByType'
        ],
        [allItemsQueryKey, parentId]
    );

    const getListOptions = useCallback(() => {
        const listOptions: ListOptions = {
            items: enhancedItems,
            context: collectionType
        };

        if (viewType === LibraryTab.Songs) {
            listOptions.showParentTitle = true;
            listOptions.action = ItemAction.PlayAllFromHere;
            listOptions.smallIcon = true;
            listOptions.showArtist = true;
            listOptions.addToListButton = true;
        } else if (viewType === LibraryTab.Albums) {
            listOptions.sortBy =
                libraryViewSettings.SortBy[0];
            listOptions.addToListButton = true;
        } else if (viewType === LibraryTab.Episodes) {
            listOptions.showParentTitle = true;
        }

        return listOptions;
    }, [
        enhancedItems,
        collectionType,
        viewType,
        libraryViewSettings.SortBy
    ]);

    const getCardOptions = useCallback(() => {
        let shape = CardShape.Portrait;
        let imageType: ImageType = ImageType.Primary;
        let preferThumb = false;

        const applyDisplay = (
            display: 'poster' | 'landscape' | 'banner'
        ) => {
            if (display === 'landscape') {
                shape = CardShape.Backdrop;
                imageType = ImageType.Thumb;
                preferThumb = true;
                return;
            }

            if (display === 'banner') {
                shape = CardShape.Banner;
                imageType = ImageType.Banner;
                preferThumb = false;
                return;
            }

            shape = CardShape.Portrait;
            imageType = ImageType.Primary;
            preferThumb = false;
        };

        if (collectionType === CollectionType.Music) {
            shape = CardShape.Square;
            imageType = ImageType.Primary;
        } else if (
            collectionType === CollectionType.Musicvideos
        ) {
            shape = CardShape.Backdrop;
            imageType = ImageType.Thumb;
            preferThumb = true;
        } else if (
            collectionType === CollectionType.Books
        ) {
            shape = CardShape.Portrait;
            imageType = ImageType.Primary;
        } else if (
            collectionType === CollectionType.Movies
        ) {
            applyDisplay(
                minitigerLibrarySettings.movieDisplay
            );
        } else if (
            collectionType === CollectionType.Tvshows
        ) {
            applyDisplay(
                minitigerLibrarySettings.seriesDisplay
            );
        } else {
            applyDisplay(
                minitigerLibrarySettings.otherDisplay
            );
        }

        const cardOptions: CardOptions = {
            shape,
            showTitle: true,
            showYear: true,
            cardLayout: libraryViewSettings.CardLayout,
            centerText: false,
            context: collectionType,
            coverImage: true,
            preferThumb,
            overlayText: false,
            imageType,
            queryKey: allViewsQueryKey,
            serverId: __legacyApiClient__?.serverId(),
            cardCssClass: classNames(
                'minitigerNativeLibraryCard',
                ([ CardShape.Backdrop, CardShape.Banner ] as CardShape[])
                    .includes(shape)
                    && 'minitigerNativeLibraryCardLandscape',
                collectionType === CollectionType.Books
                    && 'minitigerNativeLibraryCardBooks',
                collectionType === CollectionType.Musicvideos
                    && 'minitigerNativeLibraryCardMusicvideos'
            )
        };

        Object.assign(
            cardOptions,
            {
                minitiger: {
                    showAudioFlags:
                        minitigerHomeSettings.showAudioFlags,
                    showFskBadges:
                        minitigerHomeSettings.showFskBadges,
                    showPlayedIndicators:
                        minitigerHomeSettings.showPlayedIndicators,
                    showVirtualAssign:
                        isAdmin
                        && virtualConfig.libraries.length > 0,
                    isVirtuallyAssigned,
                    onVirtualAssign:
                        setAssignTarget
                }
            }
        );

        if (
            viewType === LibraryTab.Songs
            || viewType === LibraryTab.Albums
            || viewType === LibraryTab.Episodes
        ) {
            cardOptions.showParentTitle = true;
            cardOptions.overlayPlayButton = true;
        } else if (
            viewType === LibraryTab.Artists
            || viewType === LibraryTab.Authors
        ) {
            cardOptions.lines = 1;
            cardOptions.showYear = false;
            cardOptions.overlayPlayButton = true;
        } else if (viewType === LibraryTab.Movies) {
            cardOptions.overlayPlayButton = true;
            cardOptions.overlayMoreButton = true;
        } else if (
            viewType === LibraryTab.Series
            || viewType === LibraryTab.Studios
        ) {
            cardOptions.overlayPlayButton = true;
            cardOptions.overlayMoreButton = true;
        }

        return cardOptions;
    }, [
        __legacyApiClient__,
        libraryViewSettings.CardLayout,
        libraryViewSettings.ImageType,
        collectionType,
        allViewsQueryKey,
        viewType,
        minitigerLibrarySettings.movieDisplay,
        minitigerLibrarySettings.seriesDisplay,
        minitigerLibrarySettings.otherDisplay,
        minitigerHomeSettings.showAudioFlags,
        minitigerHomeSettings.showFskBadges,
        minitigerHomeSettings.showPlayedIndicators,
        isAdmin,
        virtualConfig.libraries
    ]);

    const getItems = useCallback(() => {
        if (!itemsResult?.data?.Items?.length) {
            return (
                <NoItemsMessage
                    message={
                        noItemsMessage
                        ?? 'MessageNoItemsAvailable'
                    }
                />
            );
        }

        if (
            libraryViewSettings.ViewMode
            === ViewMode.ListView
        ) {
            return (
                <Lists
                    items={itemsResult?.data?.Items ?? []}
                    listOptions={getListOptions()}
                />
            );
        }

        return (
            <Cards
                items={enhancedItems}
                cardOptions={getCardOptions()}
            />
        );
    }, [
        libraryViewSettings.ViewMode,
        enhancedItems,
        getListOptions,
        getCardOptions,
        noItemsMessage
    ]);

    const handleAlphabetChange = useCallback((
        newValue: string | null | undefined
    ) => {
        setLibraryViewSettings(previous => ({
            ...previous,
            StartIndex: 0,
            Alphabet: newValue
        }));
    }, [setLibraryViewSettings]);

    const hasSortName = !libraryViewSettings.SortBy
        .includes(ItemSortBy.Random);

    const hasFilters = Object.values(
        libraryViewSettings.Filters ?? {}
    ).some(filter => Boolean(filter));

    const itemsContainerClass = classNames(
        'padded-left padded-right',
        libraryViewSettings.ViewMode === ViewMode.ListView
            ? 'vertical-list'
            : 'vertical-wrap'
    );

    const showAlphabetBar =
        isAlphabetPickerEnabled && hasSortName;

    const sortCode = getSortCode(libraryViewSettings);

    const totalRecordCount =
        itemsResult?.data?.TotalRecordCount ?? 0;

    const startIndex =
        libraryViewSettings.StartIndex ?? 0;

    const paginationRequired =
        Boolean(isPaginationEnabled)
        && paginationLimit > 0
        && totalRecordCount > paginationLimit;

    const paginationStart =
        totalRecordCount > 0
            ? startIndex + 1
            : 0;

    const paginationEnd =
        paginationLimit > 0
            ? Math.min(
                startIndex + paginationLimit,
                totalRecordCount
            )
            : totalRecordCount;

    return (
        <>
        <Box className='padded-bottom-page'>
            {!minitigerLibrarySettings.customNavigationEnabled
                && isAlphabetPickerSupported
                && showAlphabetBar
                && (
                    <AlphabetPicker
                        value={libraryViewSettings.Alphabet}
                        onChange={handleAlphabetChange}
                    />
                )}

            {minitigerLibrarySettings.customNavigationEnabled
                && showAlphabetBar
                && (
                <div
                    className={[
                        'minitigerLibraryAZBar',
                        azDockPhase === 'rolling'
                            ? 'isDocking'
                            : '',
                        azDockPhase === 'side'
                            ? 'isDockedSide'
                            : ''
                    ].filter(Boolean).join(' ')}
                >
                    <div className='minitigerLibraryLetters'>
                        <button
                            type='button'
                            className={
                                !libraryViewSettings.Alphabet
                                    ? 'isActive'
                                    : ''
                            }
                            onClick={() =>
                                handleAlphabetChange(null)
                            }
                        >
                            Alle
                        </button>

                        {LETTER_VALUES.map(letter => (
                            <button
                                key={letter}
                                type='button'
                                className={
                                    libraryViewSettings.Alphabet
                                    === letter
                                        ? 'isActive'
                                        : ''
                                }
                                onClick={() =>
                                    handleAlphabetChange(letter)
                                }
                            >
                                {letter === '#' ? '0-9' : letter}
                            </button>
                        ))}
                    </div>

                    <div className='minitigerLibraryBarTools'>
                        <select
                            className='minitigerLibrarySort'
                            value={sortCode}
                            aria-label='Sortierung'
                            onChange={event =>
                                applySort(
                                    parseSortCode(
                                        event.currentTarget.value
                                    ),
                                    setLibraryViewSettings
                                )
                            }
                        >
                            <option value='SortNameAsc'>
                                A-Z
                            </option>
                            <option value='SortNameDesc'>
                                Z-A
                            </option>
                            <option value='YearDesc'>
                                Erscheinungsjahr ↓
                            </option>
                            <option value='YearAsc'>
                                Erscheinungsjahr ↑
                            </option>
                            <option value='DateCreatedDesc'>
                                Hinzugefügt ↓
                            </option>
                            <option value='DateCreatedAsc'>
                                Hinzugefügt ↑
                            </option>
                            <option value='RatingDesc'>
                                Bewertung ↓
                            </option>
                            <option value='RatingAsc'>
                                Bewertung ↑
                            </option>
                        </select>

                        {isBtnFilterEnabled && (
                            <div className='minitigerLibraryFilterButton'>
                                <FilterButton
                                    parentId={parentId}
                                    itemType={itemType ?? []}
                                    viewType={viewType}
                                    hasFilters={hasFilters}
                                    libraryViewSettings={
                                        libraryViewSettings
                                    }
                                    setLibraryViewSettings={
                                        setLibraryViewSettings
                                    }
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {(!itemsResult || itemsResult.isPending) ? (
                <Loading />
            ) : (
                <ItemsContainer
                    className={itemsContainerClass}
                    parentId={parentId}
                    reloadItems={itemsResult?.refetch}
                    queryKey={allItemsQueryKey}
                >
                    {getItems()}
                </ItemsContainer>
            )}

            {paginationRequired && (
                <div className='minitigerLibraryPagination'>
                    <span>
                        {paginationStart.toLocaleString('de-DE')}
                        {'–'}
                        {paginationEnd.toLocaleString('de-DE')}
                        {' von '}
                        {totalRecordCount.toLocaleString('de-DE')}
                    </span>

                    <Pagination
                        setLibraryViewSettings={
                            setLibraryViewSettings
                        }
                        index={startIndex}
                        pageSize={paginationLimit}
                        total={totalRecordCount}
                        disabled={
                            Boolean(itemsResult?.isPending)
                            || Boolean(
                                itemsResult?.isPlaceholderData
                            )
                        }
                    />
                </div>
            )}
        </Box>

        {assignTarget && (
            <MinitigerVirtualAssignModal
                item={assignTarget}
                config={virtualConfig}
                onSave={setItemMembership}
                onClose={() =>
                    setAssignTarget(null)
                }
            />
        )}
        </>
    );
};

export default ItemsView;
