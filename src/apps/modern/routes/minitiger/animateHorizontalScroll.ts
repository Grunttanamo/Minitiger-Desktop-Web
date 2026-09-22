const runningAnimations =
    new WeakMap<HTMLElement, number>();

const easeInOutCubic = (value: number) => (
    value < 0.5
        ? 4 * value * value * value
        : 1 - Math.pow(-2 * value + 2, 3) / 2
);

/**
 * Qt WebEngine may ignore or effectively skip native smooth scrolling.
 * Animate scrollLeft ourselves so Minitiger rails keep the same gentle
 * swipe motion in Browser and Desktop.
 */
export const animateMinitigerHorizontalScroll = (
    element: HTMLElement,
    delta: number,
    duration = 380
) => {
    const running =
        runningAnimations.get(element);

    if (running !== undefined) {
        window.cancelAnimationFrame(running);
    }

    const start = element.scrollLeft;
    const max = Math.max(
        0,
        element.scrollWidth - element.clientWidth
    );
    const target = Math.max(
        0,
        Math.min(max, start + delta)
    );
    const distance = target - start;

    if (Math.abs(distance) < 1) {
        element.scrollLeft = target;
        runningAnimations.delete(element);
        return;
    }

    const startedAt = performance.now();

    const frame = (now: number) => {
        const progress = Math.min(
            1,
            (now - startedAt) / duration
        );

        element.scrollLeft =
            start
            + distance * easeInOutCubic(progress);

        if (progress < 1) {
            const id =
                window.requestAnimationFrame(frame);

            runningAnimations.set(
                element,
                id
            );
            return;
        }

        element.scrollLeft = target;
        runningAnimations.delete(element);
    };

    const id =
        window.requestAnimationFrame(frame);

    runningAnimations.set(
        element,
        id
    );
};

// MINITIGER_PATCH_MARKER: PHASE_2_1_NATIVE_RAIL_SMOOTH_SCROLL
