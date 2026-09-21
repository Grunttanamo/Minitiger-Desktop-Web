import { useEffect } from 'react';

import {
    getContrastTextColor,
    type MinitigerHomeSettings
} from '../config/homeSettings';

const useMinitigerThemeVariables = (
    settings: MinitigerHomeSettings
) => {
    useEffect(() => {
        const root = document.documentElement;

        const variables: Record<string, string> = {
            '--mt-accent': settings.accentColor,
            '--mt-accent-hover': settings.primaryHoverColor,
            '--mt-accent-text':
                getContrastTextColor(settings.accentColor),
            '--mt-button': settings.secondaryColor,
            '--mt-button-hover': settings.secondaryHoverColor,
            '--mt-library-bar': settings.libraryBarColor,
            '--mt-library-bar-text': settings.libraryBarTextColor,
            '--mt-banner-meta': settings.bannerMetaColor,
            '--mt-glow-color': settings.glowColor,
            '--mt-arrow-color': settings.arrowColor,
            '--mt-arrow-text':
                getContrastTextColor(settings.arrowColor),
            '--mt-genre-tag-color': settings.genreTagColor,
            '--mt-genre-tag-text':
                getContrastTextColor(settings.genreTagColor),
            '--mt-glow-opacity':
                settings.glowEnabled
                    ? String(settings.glowStrength / 100)
                    : '0',
            '--mt-glow-size': `${settings.glowSize}px`,
            '--mt-played-indicator-size':
                `${settings.playedIndicatorSize}px`,
            '--mt-played-indicator-font-size':
                `${settings.playedIndicatorFontSize}px`,

            // Legacy aliases keep old Minitiger-derived CSS compatible.
            '--minitiger-accent': settings.accentColor,
            '--minitiger-accent-hover':
                settings.primaryHoverColor,
            '--minitiger-accent-text':
                getContrastTextColor(settings.accentColor),
            '--minitiger-secondary':
                settings.secondaryColor,
            '--minitiger-secondary-hover':
                settings.secondaryHoverColor,
            '--minitiger-library-bar':
                settings.libraryBarColor,
            '--minitiger-library-bar-text':
                settings.libraryBarTextColor,
            '--minitiger-banner-meta':
                settings.bannerMetaColor,
            '--minitiger-glow':
                settings.glowColor
        };

        root.setAttribute(
            'data-minitiger-played-shape',
            settings.playedIndicatorShape
        );
        root.setAttribute(
            'data-minitiger-hover-enabled',
            settings.hoverEnabled ? 'true' : 'false'
        );
        root.setAttribute(
            'data-minitiger-native-shell',
            window.NativeShell ? 'true' : 'false'
        );
        root.setAttribute(
            'data-minitiger-glow-enabled',
            settings.glowEnabled ? 'true' : 'false'
        );
        root.setAttribute(
            'data-minitiger-card-text-centered',
            settings.cardTextCentered
                ? 'true'
                : 'false'
        );

        Object.entries(variables).forEach(
            ([ name, value ]) => {
                root.style.setProperty(name, value);
            }
        );
    }, [
        settings.accentColor,
        settings.arrowColor,
        settings.bannerMetaColor,
        settings.cardTextCentered,
        settings.glowColor,
        settings.glowEnabled,
        settings.glowSize,
        settings.glowStrength,
        settings.genreTagColor,
        settings.hoverEnabled,
        settings.libraryBarColor,
        settings.libraryBarTextColor,
        settings.playedIndicatorFontSize,
        settings.playedIndicatorShape,
        settings.playedIndicatorSize,
        settings.primaryHoverColor,
        settings.secondaryColor,
        settings.secondaryHoverColor
    ]);
};

export default useMinitigerThemeVariables;

// Native desktop diagnostics: Qt WebEngine can expose pointer/hover media
// capabilities differently from a normal browser even when CSS :hover works.
if (typeof window !== 'undefined' && window.NativeShell) {
    console.info(
        '[Minitiger Desktop Compat] pointer media '
        + JSON.stringify({
            hoverHover: window.matchMedia?.('(hover: hover)').matches ?? null,
            hoverNone: window.matchMedia?.('(hover: none)').matches ?? null,
            pointerFine: window.matchMedia?.('(pointer: fine)').matches ?? null,
            pointerCoarse: window.matchMedia?.('(pointer: coarse)').matches ?? null,
            anyHoverHover: window.matchMedia?.('(any-hover: hover)').matches ?? null,
            anyPointerFine: window.matchMedia?.('(any-pointer: fine)').matches ?? null
        })
    );
}

// MINITIGER_PATCH_MARKER: PHASE_18_15_0_GLOBAL_HOVER_DETAIL_QUICKPLAY

// MINITIGER_PATCH_MARKER: PHASE_18_18_3_CENTERED_CARD_TEXT_THEME
