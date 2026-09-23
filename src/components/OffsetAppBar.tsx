import AppBar, { type AppBarProps } from '@mui/material/AppBar';
import useScrollTrigger from '@mui/material/useScrollTrigger';
import React, { useLayoutEffect, useRef, useState, type FC, type PropsWithChildren } from 'react';
import ResizeObserver from 'resize-observer-polyfill';

const DEFAULT_APP_BAR_HEIGHT = 64;
const DENSE_APP_BAR_HEIGHT = 48;

interface OffsetAppBarProps extends AppBarProps {
    dense?: boolean;
    elevation?: number;
    forceTransparent?: boolean;
    forcedBackgroundColor?: string;
    forcedBackdropBlur?: number;
}

const OffsetAppBar: FC<PropsWithChildren<OffsetAppBarProps>> = ({
    children,
    dense = false,
    elevation = 1,
    forceTransparent = false,
    forcedBackgroundColor,
    forcedBackdropBlur = 0,
    ...props
}) => {
    const appBarRef = useRef<HTMLHtmlElement>(null);
    const [height, setHeight] = useState(dense ? DENSE_APP_BAR_HEIGHT : DEFAULT_APP_BAR_HEIGHT);

    const scrollTrigger = useScrollTrigger({
        disableHysteresis: true,
        threshold: 0
    });

    useLayoutEffect(() => {
        const el = appBarRef.current;
        if (!el) return;

        const updateHeight = () => {
            setHeight(Math.ceil(el.getBoundingClientRect().height || 0));
        };

        updateHeight();

        const observer = new ResizeObserver(entries => {
            window.requestAnimationFrame(() => {
                for (const entry of entries) {
                    setHeight(Math.ceil(entry.contentRect.height || 0));
                }
            });
        });
        observer.observe(el);
        window.addEventListener('resize', updateHeight);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateHeight);
        };
    }, []);

    useLayoutEffect(() => {
        const el = appBarRef.current;

        if (!el || !forcedBackgroundColor) {
            return;
        }

        /*
         * Minitiger pages historically shipped several "always transparent"
         * !important rules. Apply the user-selected glass appearance as an
         * inline !important style so those legacy rules cannot win the cascade.
         */
        el.style.setProperty(
            'background',
            forcedBackgroundColor,
            'important'
        );
        el.style.setProperty(
            'background-color',
            forcedBackgroundColor,
            'important'
        );
        el.style.setProperty(
            'background-image',
            'none',
            'important'
        );
        el.style.setProperty(
            'box-shadow',
            'none',
            'important'
        );

        const blur = forcedBackdropBlur > 0
            ? `blur(${forcedBackdropBlur}px)`
            : 'none';

        el.style.setProperty(
            'backdrop-filter',
            blur,
            'important'
        );
        el.style.setProperty(
            '-webkit-backdrop-filter',
            blur,
            'important'
        );
    }, [
        forcedBackdropBlur,
        forcedBackgroundColor
    ]);

    const raised = scrollTrigger && !forceTransparent;

    return (
        <>
            <AppBar
                {...props}
                ref={appBarRef}
                position='fixed'
                color={raised ? 'default' : 'transparent'}
                elevation={raised ? elevation : 0}
                sx={forceTransparent ? {
                    backgroundColor: 'transparent !important',
                    backgroundImage: 'none !important',
                    boxShadow: 'none !important'
                } : props.sx}
            >
                {children}
            </AppBar>
            <div
                aria-hidden='true'
                style={{
                    height,
                    width: '100%',
                    flexShrink: 0
                }}
            />
        </>
    );
};

export default OffsetAppBar;
