export type MinitigerCastShape =
    | 'portrait'
    | 'square'
    | 'circle'
    | 'oval'
    | 'star'
    | 'landscape';

export type MinitigerDetailLayout =
    | 'compact'
    | 'wide';

export interface MinitigerDetailSettings {
    layoutMode: MinitigerDetailLayout;
    showStudios: boolean;
    showGenres: boolean;
    trailerButtonEnabled: boolean;
    trailerDetectButtonEnabled: boolean;
    directoryUpdateButtonEnabled: boolean;
    posterWidth: number;
    seasonPosterWidth: number;
    seasonWrapEnabled: boolean;
    contentWidth: number;
    mangaPosterWidth: number;
    mangaVolumeWidth: number;
    castWidth: number;
    castShape: MinitigerCastShape;
}

export const DEFAULT_DETAIL_SETTINGS: MinitigerDetailSettings = {
    layoutMode: 'compact',
    showStudios: true,
    showGenres: true,
    trailerButtonEnabled: true,
    trailerDetectButtonEnabled: true,
    directoryUpdateButtonEnabled: true,
    posterWidth: 460,
    seasonPosterWidth: 260,
    seasonWrapEnabled: false,
    contentWidth: 380,
    mangaPosterWidth: 460,
    mangaVolumeWidth: 260,
    castWidth: 148,
    castShape: 'portrait'
};

const clamp = (
    value: unknown,
    fallback: number,
    min: number,
    max: number
) => {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return fallback;
    }

    return Math.min(
        max,
        Math.max(
            min,
            Math.round(numeric)
        )
    );
};

const parseDetailLayout = (
    value: unknown
): MinitigerDetailLayout => {
    if (value === 'wide') {
        return 'wide';
    }

    return 'compact';
};

const parseCastShape = (
    value: unknown
): MinitigerCastShape => {
    if (
        value === 'square'
        || value === 'circle'
        || value === 'oval'
        || value === 'star'
        || value === 'landscape'
    ) {
        return value;
    }

    return 'portrait';
};

export const normalizeDetailSettings = (
    value: unknown
): MinitigerDetailSettings => {
    if (
        !value
        || typeof value !== 'object'
    ) {
        return {
            ...DEFAULT_DETAIL_SETTINGS
        };
    }

    const source =
        value as Partial<MinitigerDetailSettings>;

    return {
        layoutMode:
            parseDetailLayout(
                source.layoutMode
            ),
        showStudios: source.showStudios !== false,
        showGenres: source.showGenres !== false,
        trailerButtonEnabled:
            source.trailerButtonEnabled !== false,
        trailerDetectButtonEnabled:
            source.trailerDetectButtonEnabled !== false,
        directoryUpdateButtonEnabled:
            source.directoryUpdateButtonEnabled !== false,
        posterWidth: clamp(
            source.posterWidth,
            DEFAULT_DETAIL_SETTINGS.posterWidth,
            260,
            620
        ),
        seasonPosterWidth: clamp(
            source.seasonPosterWidth,
            DEFAULT_DETAIL_SETTINGS.seasonPosterWidth,
            120,
            360
        ),
        seasonWrapEnabled:
            source.seasonWrapEnabled === true,
        contentWidth: clamp(
            source.contentWidth,
            DEFAULT_DETAIL_SETTINGS.contentWidth,
            240,
            620
        ),
        mangaPosterWidth: clamp(
            source.mangaPosterWidth,
            source.posterWidth ?? DEFAULT_DETAIL_SETTINGS.mangaPosterWidth,
            220,
            620
        ),
        mangaVolumeWidth: clamp(
            source.mangaVolumeWidth,
            source.seasonPosterWidth ?? DEFAULT_DETAIL_SETTINGS.mangaVolumeWidth,
            100,
            360
        ),
        castWidth: clamp(
            source.castWidth,
            DEFAULT_DETAIL_SETTINGS.castWidth,
            90,
            240
        ),
        castShape:
            parseCastShape(
                source.castShape
            )
    };
};

// MINITIGER_PATCH_MARKER: PHASE_18_18_1_SEASON_WRAP
