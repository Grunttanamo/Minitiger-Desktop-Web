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

const isScrollableY = (
    element: HTMLElement
) => {
    if (
        element.scrollHeight
        <= element.clientHeight + 1
    ) {
        return false;
    }

    const style =
        window.getComputedStyle(element);

    return /auto|scroll|overlay/i.test(
        style.overflowY
    );
};

const findScrollContainer = (
    scope: HTMLElement
): HTMLElement | null => {
    let current:
        HTMLElement
        | null = scope;

    while (current) {
        if (isScrollableY(current)) {
            return current;
        }

        current =
            current.parentElement;
    }

    const scrollingElement =
        document.scrollingElement;

    return scrollingElement
        instanceof HTMLElement
        ? scrollingElement
        : document.documentElement;
};

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
                activeScroller.scrollTop;
            const distance =
                targetTop - current;

            if (Math.abs(distance) < 0.6) {
                activeScroller.scrollTop =
                    targetTop;
                frame = 0;
                return;
            }

            activeScroller.scrollTop =
                current + distance * 0.22;

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
            ) {
                return;
            }

            const target =
                event.target instanceof Element
                    ? event.target
                    : null;

            const scope =
                target?.closest(
                    '.minitigerVideoDetailsPage, .minitigerHome'
                ) as HTMLElement | null;

            if (!scope) {
                return;
            }

            const scroller =
                findScrollContainer(
                    scope
                );

            if (!scroller) {
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
                activeScroller = scroller;
                targetTop =
                    scroller.scrollTop;
            }

            const maxTop =
                Math.max(
                    0,
                    scroller.scrollHeight
                    - scroller.clientHeight
                );

            targetTop =
                Math.max(
                    0,
                    Math.min(
                        maxTop,
                        targetTop
                        + event.deltaY * scale
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

        document.addEventListener(
            'wheel',
            onWheel,
            {
                capture: true,
                passive: false
            }
        );

        return () => {
            stopAnimation();
            document.removeEventListener(
                'wheel',
                onWheel,
                true
            );
        };
    }, []);

    return null;
};

export default MinitigerSmoothScrollHost;
