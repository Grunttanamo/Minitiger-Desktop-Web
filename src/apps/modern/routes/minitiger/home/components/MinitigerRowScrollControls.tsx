import React, { useCallback, useEffect, useRef, useState } from 'react';
import { animateMinitigerHorizontalScroll } from '../../animateHorizontalScroll';

interface Props {
    sectionClass: string;
    rowClass: string;
    label: string;
    watchKey: string;
}

// Mirror the normal media row's overflow measurement.
const MinitigerRowScrollControls = ({ sectionClass, rowClass, label, watchKey }: Props) => {
    const controlsRef = useRef<HTMLDivElement | null>(null);
    const [canScroll, setCanScroll] = useState(false);
    const findRow = useCallback(() => controlsRef.current
        ?.closest('.' + sectionClass)
        ?.querySelector<HTMLElement>('.' + rowClass), [sectionClass, rowClass]);

    useEffect(() => {
        const row = findRow();
        if (!row) return;
        const update = () => setCanScroll(row.scrollWidth > row.clientWidth + 2);
        const observer = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(update) : null;
        observer?.observe(row);
        Array.from(row.children).forEach(child => observer?.observe(child));
        const mutation = new MutationObserver(() => {
            observer?.disconnect();
            observer?.observe(row);
            Array.from(row.children).forEach(child => observer?.observe(child));
            update();
        });
        mutation.observe(row, { childList: true });
        window.addEventListener('resize', update);
        const frame = requestAnimationFrame(update);
        return () => {
            cancelAnimationFrame(frame);
            mutation.disconnect();
            observer?.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [findRow, watchKey]);

    const scroll = (direction: -1 | 1) => {
        const row = findRow();
        if (!row) return;
        animateMinitigerHorizontalScroll(row, direction * Math.max(320, row.clientWidth * 0.78));
    };

    return <div ref={controlsRef} className={`minitigerAdaptiveRowControls${canScroll ? ' hasOverflow' : ''}`}>
        {canScroll && <div className='minitigerRowArrows'>
            <button type='button' aria-label={label + ' nach links scrollen'} onClick={() => scroll(-1)}>‹</button>
            <button type='button' aria-label={label + ' nach rechts scrollen'} onClick={() => scroll(1)}>›</button>
        </div>}
    </div>;
};
export default MinitigerRowScrollControls;
