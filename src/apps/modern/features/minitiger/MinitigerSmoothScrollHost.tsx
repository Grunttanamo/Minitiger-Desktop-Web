import { useEffect } from 'react';

const isNativeMinitigerDesktop = () => (
    typeof window !== 'undefined'
    && Boolean(
        window.NativeShell
        || /QtWebEngine|Jellyfin(?:\\s+Desktop|MediaPlayer)/i.test(
            navigator.userAgent
        )
    )
);

const shouldIgnoreTarget = (
    target: EventTarget | null
) => {
    if (!(target instanceof Element)) {
        return false;
    }

    return Boolean(
        target.closest(
            [
                'dialog',
                '[role="dialog"]',
                '.formDialog',
                '.minitigerNativeSelectMenu',
                'textarea',
                'input[type="number"]',
                'input[type="range"]',
                'select'
            ].join(',')
        )
    );
};

const isScrollableY = (
    element: HTMLElement
) => {
    if (
        element.scrollHeight
        <= element.clientHeight + 1
    ) {
        return false;
    }

    if (
        element === document.body
        || element === document.documentElement
        || element === document.scrollingElement
    ) {
        return true;
    }

    const style =
        window.getComputedStyle(element);

    return /auto|scroll|overlay/i.test(
        style.overflowY
    );
};

const findScrollContainer = (
    target: EventTarget | null
): HTMLElement | null => {
    let current =
        target instanceof HTMLElement
            ? target
            : target instanceof Element
                ? target.parentElement
                : null;

    while (current) {
        if (isScrollableY(current)) {
            return current;
        }

        current =
            current.parentElement;
    }

    const scrollingElement =
        document.scrollingElement;

    if (
        scrollingElement
        instanceof HTMLElement
        && isScrollableY(
            scrollingElement
        )
    ) {
        return scrollingElement;
    }

    return null;
};

const getScrollTop = (
    scroller: HTMLElement
) => {
    if (
        scroller === document.body
        || scroller === document.documentElement
        || scroller === document.scrollingElement
    ) {
        return window.scrollY
            || document.documentElement.scrollTop
            || document.body.scrollTop
            || 0;
    }

    return scroller.scrollTop;
};

const getMaxScrollTop = (
    scroller: HTMLElement
) => Math.max(
    0,
    scroller.scrollHeight
    - scroller.clientHeight
);

const setScrollTop = (
    scroller: HTMLElement,
    value: number
) => {
    if (
        scroller === document.body
        || scroller === document.documentElement
        || scroller === document.scrollingElement
    ) {
        window.scrollTo(
            window.scrollX,
            value
        );
        return;
    }

    scroller.scrollTop =
        value;
};

const canScrollInDirection = (
    scroller: HTMLElement,
    deltaY: number
) => {
    const current =
        getScrollTop(scroller);
    const maxTop =
        getMaxScrollTop(scroller);

    return deltaY > 0
        ? current < maxTop - 0.5
        : current > 0.5;
};

const WHEEL_SPEED_MULTIPLIER = 1.55;
const SMOOTHING_FACTOR = 0.3;

const MinitigerSmoothScrollHost = () => {
    useEffect(() => {
        if (!isNativeMinitigerDesktop()) {
            return;
        }

        let frame = 0;
        let activeScroller:
            HTMLElement
            | null = null;
        let targetTop = 0;

        const stopAnimation = () => {
            if (frame) {
                window.cancelAnimationFrame(
                    frame
                );
                frame = 0;
            }
        };

        const animate = () => {
            if (!activeScroller) {
                frame = 0;
                return;
            }

            const current =
                getScrollTop(
                    activeScroller
                );
            const distance =
                targetTop - current;

            if (Math.abs(distance) < 0.6) {
                setScrollTop(
                    activeScroller,
                    targetTop
                );
                frame = 0;
                return;
            }

            setScrollTop(
                activeScroller,
                current
                + distance * SMOOTHING_FACTOR
            );

            frame =
                window.requestAnimationFrame(
                    animate
                );
        };

        const onWheel = (
            event: WheelEvent
        ) => {
            if (
                event.defaultPrevented
                || event.ctrlKey
                || event.metaKey
                || shouldIgnoreTarget(
                    event.target
                )
                || Math.abs(event.deltaY)
                    <= Math.abs(event.deltaX)
                || event.deltaY === 0
            ) {
                return;
            }

            const scroller =
                findScrollContainer(
                    event.target
                );

            /*
             * Critical safety rule: if there is no real scroll container, or
             * this container has reached its edge, do not cancel the wheel
             * event. Jellyfin/Qt can then use its normal native scrolling or
             * bubble into a parent scroller.
             */
            if (
                !scroller
                || !canScrollInDirection(
                    scroller,
                    event.deltaY
                )
            ) {
                return;
            }

            const scale =
                event.deltaMode === WheelEvent.DOM_DELTA_LINE
                    ? 32
                    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                        ? Math.max(
                            1,
                            scroller.clientHeight
                        )
                        : 1;

            if (
                activeScroller
                !== scroller
            ) {
                stopAnimation();
                activeScroller =
                    scroller;
                targetTop =
                    getScrollTop(
                        scroller
                    );
            }

            const maxTop =
                getMaxScrollTop(
                    scroller
                );

            targetTop =
                Math.max(
                    0,
                    Math.min(
                        maxTop,
                        targetTop
                        + event.deltaY
                            * scale
                            * WHEEL_SPEED_MULTIPLIER
                    )
                );

            event.preventDefault();

            if (!frame) {
                frame =
                    window.requestAnimationFrame(
                        animate
                    );
            }
        };

        const stopForNativeAutoscroll = (
            event: MouseEvent
        ) => {
            if (event.button !== 1) {
                return;
            }

            /*
             * Chromium's middle-button autoscroll owns scrollTop itself.
             * Cancel any pending interpolated target so we never snap back
             * to an old wheel position when native autoscroll stops.
             */
            stopAnimation();
            activeScroller = null;
            targetTop = 0;
        };

        document.addEventListener(
            'wheel',
            onWheel,
            {
                capture: true,
                passive: false
            }
        );
        document.addEventListener(
            'mousedown',
            stopForNativeAutoscroll,
            true
        );
        document.addEventListener(
            'auxclick',
            stopForNativeAutoscroll,
            true
        );

        return () => {
            stopAnimation();
            document.removeEventListener(
                'wheel',
                onWheel,
                true
            );
            document.removeEventListener(
                'mousedown',
                stopForNativeAutoscroll,
                true
            );
            document.removeEventListener(
                'auxclick',
                stopForNativeAutoscroll,
                true
            );
        };
    }, []);

    return null;
};

export default MinitigerSmoothScrollHost;
