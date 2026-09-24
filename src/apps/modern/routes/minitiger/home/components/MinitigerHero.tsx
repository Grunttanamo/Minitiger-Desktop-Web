import { useQueryClient } from '@tanstack/react-query';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { Link } from 'react-router-dom';

import { playbackManager } from 'components/playback/playbackmanager';
import { useApi } from 'hooks/useApi';
import { useToggleFavoriteMutation } from 'hooks/useFetchItems';
import { useItem } from 'hooks/useItem';
import type { ItemDto } from 'types/base/models/item-dto';

import { useMinitigerBannerItems } from '../hooks/useMinitigerBannerItems';
import MinitigerInlineTrailer, {
    resolveMinitigerLocalTrailers
} from './MinitigerInlineTrailer';
import MinitigerTrailerDebugPanel from './MinitigerTrailerDebugPanel';
import MinitigerTrailerDownloadButton from './MinitigerTrailerDownloadButton';
import {
    getBackdropImageUrl,
    getLogoImageUrl,
    getMediaTypeName,
    getRatingLabel,
    getRuntimeLabel,
    getStreamLanguages,
    shortOverview
} from '../mediaUtils';
import { getItemRoute } from '../routingUtils';


const shuffledCopy = (items: ItemDto[]) => {
    const result = [ ...items ];

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ result[i], result[j] ] = [ result[j], result[i] ];
    }

    return result;
};

interface MinitigerHeroProps {
    autoRotateMs?: number;
    maxItems?: number;
    debugEnabled?: boolean;
    youtubeTrailersEnabled?: boolean;
    localTrailersEnabled?: boolean;
    trailerButtonEnabled?: boolean;
    trailerDownloadEnabled?: boolean;
    isAdmin?: boolean;
    showNavigation?: boolean;
    showFsk?: boolean;
}

const MinitigerHero = ({
    autoRotateMs = 12000,
    maxItems = 10,
    debugEnabled = true,
    youtubeTrailersEnabled = true,
    localTrailersEnabled = true,
    trailerButtonEnabled = true,
    trailerDownloadEnabled = false,
    isAdmin = false,
    showNavigation = true,
    showFsk = true
}: MinitigerHeroProps) => {
    const {
        __legacyApiClient__: apiClient
    } = useApi();

    const queryClient = useQueryClient();

    const {
        data: bannerData,
        isPending: bannerPending,
        isError: bannerError
    } = useMinitigerBannerItems(maxItems);

    const bannerItems =
        bannerData?.items
        ?? [];

    const usingPlaylist =
        bannerData?.source
        === 'playlist';

    const lastSuccessfulCandidatesRef = useRef<ItemDto[]>([]);

    const freshCandidates = useMemo(() => {
        const usable =
            bannerItems.filter(item => {
                const type =
                    String(
                        item.Type
                        ?? ''
                    ).toLowerCase();

                /*
                 * Banner stays deliberately on top-level movies/series.
                 * Episodes, seasons and music videos do not enter the hero.
                 */
                const isTopLevel = (
                    type === 'movie'
                    || type === 'series'
                );

                return Boolean(
                    isTopLevel
                    && item.Id
                    && (
                        item.BackdropImageTags?.length
                        || item.ImageTags?.Primary
                    )
                );
            });

        /* Keep the complete curated pool.  The hero only loads artwork for
           the active item, so limiting this to ten merely made larger banner
           selections feel repetitive and could statistically hide Series. */
        return shuffledCopy(
            usable
        );
    }, [bannerItems]);

    if (freshCandidates.length) {
        lastSuccessfulCandidatesRef.current =
            freshCandidates;
    }

    /* Keep the last valid hero set while a background refresh briefly has
       no usable data. This avoids dropping to the "Minitiger Web" fallback
       between queries/remounts. */
    const candidates = freshCandidates.length
        ? freshCandidates
        : lastSuccessfulCandidatesRef.current;

    const [ activeIndex, setActiveIndex ] = useState(0);
    const [ trailerDebugOpen, setTrailerDebugOpen ] = useState(false);
    const [ trailerLoading, setTrailerLoading ] = useState(false);
    const paused = trailerDebugOpen || trailerLoading;
    const [ backdropFailed, setBackdropFailed ] = useState(false);
    const [ logoFailed, setLogoFailed ] = useState(false);
    const [ favorite, setFavorite ] = useState(false);

    /* Start at a different entry whenever a fresh candidate pool arrives.
       This makes returning to Home visibly rotate even while React Query
       reuses the same cached playlist pool. */
    useEffect(() => {
        if (!candidates.length) {
            setActiveIndex(0);
            return;
        }

        setActiveIndex(
            Math.floor(Math.random() * candidates.length)
        );
    }, [candidates]);

    const safeActiveIndex = candidates.length
        ? activeIndex % candidates.length
        : 0;

    const activeCandidate =
        candidates[safeActiveIndex];

    const {
        data: detailedItem
    } = useItem(activeCandidate?.Id ?? undefined);

    const heroItem =
        (detailedItem ?? activeCandidate) as ItemDto | undefined;

    const favoriteMutation = useToggleFavoriteMutation();

    useEffect(() => {
        if (activeIndex >= candidates.length) {
            setActiveIndex(0);
        }
    }, [ activeIndex, candidates.length ]);

    useEffect(() => {
        setBackdropFailed(false);
        setLogoFailed(false);
        setFavorite(Boolean(heroItem?.UserData?.IsFavorite));
    }, [ heroItem?.Id, heroItem?.UserData?.IsFavorite ]);

    const bannerPlaylistName =
        bannerData
        && 'playlistName' in bannerData
            ? bannerData.playlistName
            : undefined;

    useEffect(() => {
        if (
            usingPlaylist
            && bannerPlaylistName
        ) {
            console.info(
                `[Minitiger Hero] Bannerquelle: ${bannerPlaylistName} · ${candidates.length} Einträge`
            );
        } else if (!bannerPending) {
            console.info(
                `[Minitiger Hero] Bannerquelle: Zufällige Fallback-Auswahl · ${candidates.length} Einträge`
            );
        }
    }, [
        bannerPlaylistName,
        bannerPending,
        candidates.length,
        usingPlaylist
    ]);

    const showPrevious = useCallback(() => {
        if (!candidates.length) {
            return;
        }

        setActiveIndex(index =>
            (index - 1 + candidates.length) % candidates.length
        );
    }, [ candidates.length ]);

    const showNext = useCallback(() => {
        if (!candidates.length) {
            return;
        }

        setActiveIndex(index =>
            (index + 1) % candidates.length
        );
    }, [ candidates.length ]);

    useEffect(() => {
        if (
            paused
            || candidates.length <= 1
            || autoRotateMs <= 0
        ) {
            return;
        }

        const timer = window.setInterval(showNext, autoRotateMs);

        return () => window.clearInterval(timer);
    }, [
        autoRotateMs,
        candidates.length,
        paused,
        showNext
    ]);

    const handlePlay = useCallback(() => {
        if (!heroItem) {
            return;
        }

        const playbackPosition =
            heroItem.UserData?.PlaybackPositionTicks ?? 0;

        playbackManager.play({
            items: [ heroItem ],
            startPositionTicks: playbackPosition
        }).catch(error => {
            console.error(
                '[Minitiger Hero] Wiedergabe fehlgeschlagen',
                error
            );
        });
    }, [ heroItem ]);

    const handleFavorite = useCallback(async () => {
        if (!heroItem?.Id || favoriteMutation.isPending) {
            return;
        }

        try {
            const newValue = await favoriteMutation.mutateAsync({
                itemId: heroItem.Id,
                isFavorite: favorite
            });

            setFavorite(Boolean(newValue));

            await queryClient.invalidateQueries({
                queryKey: [ 'Items' ]
            });
        } catch (error) {
            console.error(
                '[Minitiger Hero] Watchlisten-Status konnte nicht geändert werden',
                error
            );
        }
    }, [
        favorite,
        favoriteMutation,
        heroItem?.Id,
        queryClient
    ]);

    const handleTrailer = useCallback(async () => {
        if (!apiClient || !heroItem?.Id) {
            return;
        }

        try {
            if (localTrailersEnabled) {
                const trailers =
                    await resolveMinitigerLocalTrailers(
                        apiClient,
                        heroItem
                    );

                if (trailers.length > 0) {
                    await playbackManager.play({
                        items: trailers
                    });

                    return;
                }
            }

            const remoteUrl = youtubeTrailersEnabled
                ? heroItem.RemoteTrailers
                    ?.map(trailer => trailer.Url)
                    .find((url): url is string => Boolean(url))
                : undefined;

            if (remoteUrl) {
                window.open(
                    remoteUrl,
                    '_blank',
                    'noopener,noreferrer'
                );
            }
        } catch (error) {
            console.error(
                '[Minitiger Hero] Trailer konnte nicht gestartet werden',
                error
            );
        }
    }, [
        apiClient,
        heroItem,
        localTrailersEnabled,
        youtubeTrailersEnabled
    ]);

    if (bannerPending && !candidates.length) {
        return (
            <section className='minitigerHero minitigerHeroLoading'>
                <div className='minitigerHeroLoadingText'>
                    🐯 Banner wird geladen …
                </div>
            </section>
        );
    }

    if ((bannerError && !candidates.length) || !heroItem) {
        return (
            <section className='minitigerHero minitigerHeroFallback'>
                <div className='minitigerHeroFallbackInner'>
                    <span>🐯</span>
                    <strong>Minitiger Web</strong>
                </div>
            </section>
        );
    }

    const backdropUrl = getBackdropImageUrl(apiClient, heroItem);
    const logoUrl = getLogoImageUrl(apiClient, heroItem);
    const overview = shortOverview(heroItem.Overview);
    const playbackPosition =
        heroItem.UserData?.PlaybackPositionTicks ?? 0;

    const metadata = [
        heroItem.ProductionYear,
        getMediaTypeName(heroItem.Type),
        getRuntimeLabel(heroItem.RunTimeTicks)
    ].filter(Boolean);

    const ratingLabel = getRatingLabel(heroItem.OfficialRating);
    const audioLanguages = getStreamLanguages(heroItem, 'Audio');
    const subtitleLanguages = getStreamLanguages(
        heroItem,
        'Subtitle'
    );

    const hasTrailer = (
        (
            localTrailersEnabled
            && (heroItem.LocalTrailerCount ?? 0) > 0
        )
        || (
            youtubeTrailersEnabled
            && Boolean(
                heroItem.RemoteTrailers
                    ?.some(trailer => Boolean(trailer.Url))
            )
        )
    );

    return (
        <section
            className='minitigerHero'
        >
            <div className='minitigerHeroMediaLayer'>
                <div className='minitigerHeroBackdrop'>
                {backdropUrl && !backdropFailed && (
                    <img
                        key={`${heroItem.Id}-backdrop`}
                        src={backdropUrl}
                        alt=''
                        onError={() => setBackdropFailed(true)}
                    />
                )}

                <MinitigerInlineTrailer
                    apiClient={apiClient}
                    item={heroItem}
                    className='minitigerHeroTrailerMedia'
                    delayMs={900}
                    onLoadingChange={setTrailerLoading}
                    allowYouTube={youtubeTrailersEnabled}
                    allowLocal={localTrailersEnabled}
                />
                </div>

                <div className='minitigerHeroShade' />
            </div>
            <div
                className='minitigerHeroBottomFade'
                aria-hidden='true'
            />

            <div className='minitigerHeroContent'>
                <div className='minitigerHeroLogoHost'>
                    {logoUrl && !logoFailed ? (
                        <img
                            key={`${heroItem.Id}-logo`}
                            className='minitigerHeroLogo'
                            src={logoUrl}
                            alt={heroItem.Name ?? ''}
                            onError={() => setLogoFailed(true)}
                        />
                    ) : (
                        <h1 className='minitigerHeroTitle'>
                            {heroItem.Name}
                        </h1>
                    )}
                </div>

                <div className='minitigerHeroMetaRow'>
                    {metadata.length > 0 && (
                        <div className='minitigerHeroMeta'>
                            {metadata.join(' · ')}
                        </div>
                    )}

                    {heroItem.CommunityRating != null && (
                        <span className='minitigerHeroCommunityRating'>
                            ★ {heroItem.CommunityRating.toFixed(1)}
                        </span>
                    )}
                </div>

                {(audioLanguages.length > 0
                    || subtitleLanguages.length > 0) && (
                    <div className='minitigerHeroLanguageLine'>
                        {audioLanguages.length > 0 && (
                            <span>
                                Audio: {audioLanguages.join(', ')}
                            </span>
                        )}

                        {audioLanguages.length > 0
                            && subtitleLanguages.length > 0
                            && (
                                <span aria-hidden='true'> · </span>
                            )}

                        {subtitleLanguages.length > 0 && (
                            <span>
                                Untertitel: {
                                    subtitleLanguages.join(', ')
                                }
                            </span>
                        )}
                    </div>
                )}

                {overview && (
                    <p className='minitigerHeroOverview'>
                        {overview}
                    </p>
                )}

                <div className='minitigerHeroActions'>
                    <button
                        type='button'
                        className='minitigerHeroButton minitigerHeroPlay'
                        onClick={handlePlay}
                    >
                        <span aria-hidden='true'>▶</span>
                        <span>
                            {playbackPosition > 0
                                ? 'Fortsetzen'
                                : 'Abspielen'}
                        </span>
                    </button>

                    <button
                        type='button'
                        className={[
                            'minitigerHeroButton',
                            'minitigerHeroFavorite',
                            favorite ? 'minitigerHeroFavoriteOn' : ''
                        ].filter(Boolean).join(' ')}
                        onClick={handleFavorite}
                        disabled={favoriteMutation.isPending}
                    >
                        <span aria-hidden='true'>
                            {favorite ? '♥' : '♡'}
                        </span>
                        <span>Watchliste</span>
                    </button>

                    {trailerButtonEnabled && hasTrailer && (
                        <button
                            type='button'
                            className='minitigerHeroButton minitigerHeroTrailer'
                            onClick={handleTrailer}
                        >
                            <span aria-hidden='true'>🎞</span>
                            <span>Trailer</span>
                        </button>
                    )}

                    {isAdmin && trailerDownloadEnabled && (
                        <MinitigerTrailerDownloadButton
                            apiClient={apiClient}
                            item={heroItem}
                            className='minitigerHeroButton minitigerHeroTrailerDownload'
                        />
                    )}

                    <Link
                        className='minitigerHeroButton minitigerHeroInfo'
                        to={getItemRoute(heroItem)}
                    >
                        <span aria-hidden='true'>ⓘ</span>
                        <span>Weitere Infos</span>
                    </Link>


                    {debugEnabled && (
                        <MinitigerTrailerDebugPanel
                            apiClient={apiClient}
                            item={heroItem}
                            onOpenChange={setTrailerDebugOpen}
                        />
                    )}
                </div>
            </div>

            {showFsk && ratingLabel && (
                <div className='minitigerHeroFskFloating'>
                    {ratingLabel}
                </div>
            )}

            {showNavigation && candidates.length > 1 && (
                <div className='minitigerHeroNavigation'>
                    <button
                        type='button'
                        className='minitigerHeroArrow'
                        onClick={showPrevious}
                        aria-label='Vorheriger Banner'
                    >
                        ‹
                    </button>

                    <span className='minitigerHeroCounter'>
                        {safeActiveIndex + 1}/{candidates.length}
                    </span>

                    <button
                        type='button'
                        className='minitigerHeroArrow'
                        onClick={showNext}
                        aria-label='Nächster Banner'
                    >
                        ›
                    </button>
                </div>
            )}
        </section>
    );
};

export default MinitigerHero;
