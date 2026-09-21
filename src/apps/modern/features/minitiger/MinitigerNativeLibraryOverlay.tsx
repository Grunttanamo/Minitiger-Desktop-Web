import React, { useEffect, useRef } from 'react';

import type { CardOptions } from 'types/cardOptions';
import type { ItemDto } from 'types/base/models/item-dto';

import {
    getLanguageFlagUrl,
    getRatingLabel,
    getStreamLanguages,
    supportsAudioFlags,
    supportsFskBadge
} from 'apps/modern/routes/minitiger/home/mediaUtils';

import './MinitigerNativeLibraryOverlay.scss';

interface MinitigerNativeOptions {
    showAudioFlags?: boolean;
    showFskBadges?: boolean;
    showPlayedIndicators?: boolean;
    showVirtualAssign?: boolean;
    isVirtuallyAssigned?: (
        itemId?: string | null
    ) => boolean;
    onVirtualAssign?: (
        item: ItemDto
    ) => void;
}

interface Props {
    item: ItemDto;
    cardOptions: CardOptions;
}

const getFskClassName = (
    value?: string | null
) => {
    const rating = String(value ?? '');

    if (rating.includes('18')) return 'fsk18';
    if (rating.includes('16')) return 'fsk16';
    if (rating.includes('12')) return 'fsk12';
    if (rating.includes('6')) return 'fsk6';
    if (rating.includes('0')) return 'fsk0';

    return '';
};

const MinitigerNativeLibraryOverlay = ({
    item,
    cardOptions
}: Props) => {
    const overlayRef =
        useRef<HTMLDivElement>(null);

    const isNativeLibraryCard =
        String(cardOptions.cardCssClass ?? '')
            .split(/\s+/)
            .includes('minitigerNativeLibraryCard');

    useEffect(() => {
        if (!isNativeLibraryCard) {
            return;
        }

        const overlay = overlayRef.current;
        const card =
            overlay?.closest<HTMLElement>('.card')
            ?? overlay?.closest<HTMLElement>(
                '.minitigerNativeLibraryCard'
            );

        if (!card) {
            return;
        }

        let animationFrame = 0;

        const updateTextAlignment = () => {
            animationFrame = 0;

            const enabled =
                document.documentElement.getAttribute(
                    'data-minitiger-card-text-centered'
                ) === 'true';

            const lines =
                card.querySelectorAll<HTMLElement>(
                    '.cardText:not(.btnCardOptions)'
                );

            lines.forEach(line => {
                line.classList.remove(
                    'minitigerNativeCardTextAutoCenter'
                );

                if (!enabled) {
                    return;
                }

                const measuredText =
                    line.querySelector<HTMLElement>(
                        '.textActionButton'
                    )
                    ?? line;

                const overflowing =
                    measuredText.scrollWidth
                    > measuredText.clientWidth + 1;

                if (!overflowing) {
                    line.classList.add(
                        'minitigerNativeCardTextAutoCenter'
                    );
                }
            });
        };

        const scheduleUpdate = () => {
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
            }

            animationFrame =
                requestAnimationFrame(
                    updateTextAlignment
                );
        };

        scheduleUpdate();

        const rootObserver =
            new MutationObserver(scheduleUpdate);

        rootObserver.observe(
            document.documentElement,
            {
                attributes: true,
                attributeFilter: [
                    'data-minitiger-card-text-centered'
                ]
            }
        );

        const cardObserver =
            new MutationObserver(scheduleUpdate);

        cardObserver.observe(
            card,
            {
                childList: true,
                subtree: true,
                characterData: true
            }
        );

        const resizeObserver =
            new ResizeObserver(scheduleUpdate);

        resizeObserver.observe(card);

        const onMouseEnter = () => {
            if (window.NativeShell) {
                card.classList.add('minitigerNativeHover');
            }
        };

        const onMouseLeave = () => {
            card.classList.remove('minitigerNativeHover');
        };

        card.addEventListener('mouseenter', onMouseEnter);
        card.addEventListener('mouseleave', onMouseLeave);

        return () => {
            if (animationFrame) {
                cancelAnimationFrame(
                    animationFrame
                );
            }

            rootObserver.disconnect();
            cardObserver.disconnect();
            resizeObserver.disconnect();
            card.removeEventListener('mouseenter', onMouseEnter);
            card.removeEventListener('mouseleave', onMouseLeave);
            card.classList.remove('minitigerNativeHover');

            card.querySelectorAll<HTMLElement>(
                '.minitigerNativeCardTextAutoCenter'
            ).forEach(line => {
                line.classList.remove(
                    'minitigerNativeCardTextAutoCenter'
                );
            });
        };
    }, [
        isNativeLibraryCard,
        item.Id,
        item.Name
    ]);

    if (!isNativeLibraryCard) {
        return null;
    }

    const options = (
        cardOptions as CardOptions & {
            minitiger?: MinitigerNativeOptions;
        }
    ).minitiger;

    if (!options) {
        return null;
    }

    const audioFlags =
        options.showAudioFlags
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
                .slice(0, 4)
            : [];

    const ratingLabel =
        options.showFskBadges
        && supportsFskBadge(item)
            ? getRatingLabel(
                item.OfficialRating
            )
            : null;

    const played =
        Boolean(item.UserData?.Played);

    const unplayed =
        item.UserData?.UnplayedItemCount
        ?? 0;

    const canVirtualAssign = Boolean(
        options.showVirtualAssign
        && options.onVirtualAssign
        && item.Id
        && (
            String(item.Type ?? '').toLowerCase()
                === 'series'
            || String(item.Type ?? '').toLowerCase()
                === 'movie'
        )
    );

    return (
        <div ref={overlayRef} className='minitigerNativeCardOverlay'>
            {canVirtualAssign && (
                <button
                    type='button'
                    className={[
                        'minitigerNativeVirtualAssign',
                        options.isVirtuallyAssigned?.(
                            item.Id
                        )
                            ? 'isAssigned'
                            : ''
                    ].filter(Boolean).join(' ')}
                    title='Virtuelle Bibliotheken verwalten'
                    aria-label='Virtuelle Bibliotheken verwalten'
                    onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        options.onVirtualAssign?.(item);
                    }}
                >
                    ⊞
                </button>
            )}

            {options.showPlayedIndicators
                && (played || unplayed > 0)
                && (
                    <div
                        className={[
                            'minitigerNativePlayedCorner',
                            played
                                ? 'isComplete'
                                : ''
                        ].filter(Boolean).join(' ')}
                    >
                        <span className='minitigerPlayedCornerText'>{played ? '✓' : unplayed}</span>
                    </div>
                )}

            <div className='minitigerNativeBadgeRow'>
                <div className='minitigerNativeAudioFlags'>
                    {audioFlags.map((flag, index) => (
                        <img
                            key={`${flag.language}-${index}`}
                            className='minitigerNativeAudioFlag'
                            src={flag.url ?? undefined}
                            alt={flag.language}
                            title={flag.language}
                        />
                    ))}
                </div>

                {ratingLabel && (
                    <span
                        className={[
                            'minitigerNativeFsk',
                            getFskClassName(ratingLabel)
                        ].filter(Boolean).join(' ')}
                    >
                        {ratingLabel}
                    </span>
                )}
            </div>
        </div>
    );
};

export default MinitigerNativeLibraryOverlay;

// MINITIGER_PATCH_MARKER: PHASE_18_18_3A_NATIVE_TEXT_MEASURE

// MINITIGER_PATCH_MARKER: PHASE_18_18_3C_BOOK_TEXT_CENTER_FIX
