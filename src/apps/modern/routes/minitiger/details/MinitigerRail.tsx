import React, {
    type PropsWithChildren,
    useCallback,
    useEffect,
    useRef,
    useState
} from 'react';

import { animateMinitigerHorizontalScroll } from '../animateHorizontalScroll';

interface Props extends PropsWithChildren {
    className?: string;
    ariaLabel?: string;
    wrap?: boolean;
}

const MinitigerRail = ({
    className,
    ariaLabel,
    wrap = false,
    children
}: Props) => {
    const trackRef =
        useRef<HTMLDivElement>(null);

    const [
        hasOverflow,
        setHasOverflow
    ] = useState(false);

    const [
        canScrollLeft,
        setCanScrollLeft
    ] = useState(false);

    const [
        canScrollRight,
        setCanScrollRight
    ] = useState(false);

    const updateScrollState =
        useCallback(() => {
            const track =
                trackRef.current;

            if (!track) {
                setHasOverflow(false);
                setCanScrollLeft(false);
                setCanScrollRight(false);
                return;
            }

            if (wrap) {
                if (track.scrollLeft !== 0) {
                    track.scrollLeft = 0;
                }

                setHasOverflow(false);
                setCanScrollLeft(false);
                setCanScrollRight(false);
                return;
            }

            const maxScroll =
                Math.max(
                    0,
                    track.scrollWidth
                    - track.clientWidth
                );

            const overflow =
                maxScroll > 4;

            setHasOverflow(
                overflow
            );

            setCanScrollLeft(
                overflow
                && track.scrollLeft > 4
            );

            setCanScrollRight(
                overflow
                && track.scrollLeft
                    < maxScroll - 4
            );
        }, [wrap]);

    useEffect(() => {
        const track =
            trackRef.current;

        if (!track) {
            return;
        }

        const onScroll = () =>
            updateScrollState();

        track.addEventListener(
            'scroll',
            onScroll,
            {
                passive: true
            }
        );

        const resizeObserver =
            new ResizeObserver(
                updateScrollState
            );

        resizeObserver.observe(
            track
        );

        Array.from(
            track.children
        ).forEach(child => {
            if (
                child
                instanceof HTMLElement
            ) {
                resizeObserver.observe(
                    child
                );
            }
        });

        const frame =
            window.requestAnimationFrame(
                updateScrollState
            );

        const timer =
            window.setTimeout(
                updateScrollState,
                120
            );

        window.addEventListener(
            'resize',
            updateScrollState
        );

        return () => {
            track.removeEventListener(
                'scroll',
                onScroll
            );

            resizeObserver.disconnect();

            window.cancelAnimationFrame(
                frame
            );

            window.clearTimeout(
                timer
            );

            window.removeEventListener(
                'resize',
                updateScrollState
            );
        };
    }, [
        children,
        updateScrollState
    ]);

    const scroll = useCallback((
        direction: -1 | 1
    ) => {
        const track =
            trackRef.current;

        if (!track) {
            return;
        }

        const distance =
            Math.max(
                320,
                Math.round(
                    track.clientWidth
                    * 0.78
                )
            );

        animateMinitigerHorizontalScroll(
            track,
            direction * distance
        );

        window.setTimeout(
            updateScrollState,
            360
        );
    }, [
        updateScrollState
    ]);

    return (
        <div
            className={[
                'minitigerRail',
                hasOverflow
                    ? 'hasOverflow'
                    : '',
                wrap
                    ? 'isWrapped'
                    : ''
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <div
                ref={trackRef}
                className={[
                    'minitigerRailTrack',
                    wrap
                        ? 'isWrapped'
                        : '',
                    className
                ].filter(Boolean).join(' ')}
                aria-label={ariaLabel}
            >
                {children}
            </div>

            {!wrap && hasOverflow && (
                <div
                    className='minitigerRailControls'
                    aria-label={
                        ariaLabel
                            ? `${ariaLabel} Navigation`
                            : 'Reihen-Navigation'
                    }
                >
                    <button
                        type='button'
                        className='minitigerRailArrow isLeft'
                        aria-label='Nach links'
                        disabled={!canScrollLeft}
                        onClick={() =>
                            scroll(-1)
                        }
                    >
                        ‹
                    </button>

                    <button
                        type='button'
                        className='minitigerRailArrow isRight'
                        aria-label='Nach rechts'
                        disabled={!canScrollRight}
                        onClick={() =>
                            scroll(1)
                        }
                    >
                        ›
                    </button>
                </div>
            )}
        </div>
    );
};

export default MinitigerRail;

// MINITIGER_PATCH_MARKER: PHASE_18_18_1_WRAPPABLE_RAIL
