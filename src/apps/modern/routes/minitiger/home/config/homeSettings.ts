import {
    CUSTOM_ROW_IDS,
    type MinitigerCustomRowId
} from './customRows';

export const HOME_SECTION_IDS = [
    'libraries',
    'resume',
    'nextUp',
    'watchlist',
    'recent'
] as const;

export type HomeSectionId = typeof HOME_SECTION_IDS[number];

export const SYSTEM_HOME_ROW_IDS = [
    'resume',
    'nextUp',
    'watchlist',
    'recent'
] as const;

export type SystemHomeRowId =
    typeof SYSTEM_HOME_ROW_IDS[number];

export const VIRTUAL_HOME_ROW_IDS = [
    'virtual1',
    'virtual2',
    'virtual3'
] as const;

export type VirtualHomeRowId =
    typeof VIRTUAL_HOME_ROW_IDS[number];

export type HomeRowId =
    | SystemHomeRowId
    | MinitigerCustomRowId
    | VirtualHomeRowId;

export const DEFAULT_HOME_ROW_ORDER: HomeRowId[] = [
    ...SYSTEM_HOME_ROW_IDS,
    ...VIRTUAL_HOME_ROW_IDS,
    ...CUSTOM_ROW_IDS
];

export type MinitigerCardSize = 'compact' | 'normal' | 'large';

export type BannerRotationSeconds = 0 | 8 | 12 | 20 | 30 | 45 | 60;

export type BannerItemLimit = 0 | 5 | 10 | 15 | 20 | 30 | 50 | 100;

export type PlayedIndicatorShape =
    | 'round'
    | 'circle'
    | 'square'
    | 'triangle';

export interface MinitigerHomeSettings {
    accentColor: string;
    primaryHoverColor: string;
    secondaryColor: string;
    secondaryHoverColor: string;
    libraryBarColor: string;
    libraryBarTextColor: string;
    bannerMetaColor: string;
    glowColor: string;
    arrowColor: string;
    genreTagColor: string;
    glowStrength: number;
    glowSize: number;
    toolbarBrandLogoEnabled: boolean;
    toolbarBrandLogoUrl: string;
    toolbarBrandLogoSize: number;
    toolbarBrandTextEnabled: boolean;
    toolbarBrandText: string;
    customHomeRowsEnabled: boolean;
    bannerEnabled: boolean;
    bannerHeightOffset: number;
    bannerOverlayOffset: number;
    bannerFadeSize: number;
    bannerFadeStrength: number;
    bannerNavigationVisible: boolean;
    bannerFskVisible: boolean;
    bannerRotationSeconds: BannerRotationSeconds;
    bannerItemLimit: BannerItemLimit;
    cardSize: MinitigerCardSize;
    rowGap: number;
    libraryCardWidth: number;
    libraryCardGap: number;
    libraryVirtualGap: number;
    showLibraryNames: boolean;
    showAudioFlags: boolean;
    showFskBadges: boolean;
    showPlayedIndicators: boolean;
    playedIndicatorSize: number;
    playedIndicatorFontSize: number;
    playedIndicatorShape: PlayedIndicatorShape;
    trailerDebugEnabled: boolean;
    youtubeTrailersEnabled: boolean;
    sideRowTitlesEnabled: boolean;
    hoverEnabled: boolean;
    glowEnabled: boolean;
    previewEnabled: boolean;
    cardTextCentered: boolean;

    /**
     * Legacy Phase-1..11 ordering for the five original sections.
     * Kept for migration/backups. Native rendering now uses homeRowOrder.
     */
    sectionOrder: HomeSectionId[];

    /**
     * Unified row order below the fixed Media Libraries row.
     * Contains system, custom and virtual rows.
     */
    homeRowOrder: HomeRowId[];

    visibleSections: Record<HomeSectionId, boolean>;
}

export const HOME_SECTION_LABELS: Record<HomeSectionId, string> = {
    libraries: 'Medien-Bibliotheken',
    resume: 'Weiterschauen',
    nextUp: 'Als Nächstes',
    watchlist: 'Watchlist',
    recent: 'Erneut ansehen'
};

export const HOME_ROW_LABELS: Record<SystemHomeRowId, string> = {
    resume: 'Weiterschauen',
    nextUp: 'Als Nächstes',
    watchlist: 'Watchlist',
    recent: 'Erneut ansehen'
};

export const ACCENT_PRESETS = [
    '#ffbf00',
    '#ffe152',
    '#ff6b35',
    '#ff4d8d',
    '#c56cff',
    '#6f8cff',
    '#32c8ff',
    '#36d399',
    '#d4e157'
];

export const COLOR_THEME_KEYS = [
    'accentColor',
    'primaryHoverColor',
    'secondaryColor',
    'secondaryHoverColor',
    'libraryBarColor',
    'libraryBarTextColor',
    'bannerMetaColor',
    'glowColor',
    'arrowColor',
    'genreTagColor'
] as const;

export type MinitigerColorThemeKey =
    typeof COLOR_THEME_KEYS[number];

export type MinitigerColorTheme =
    Pick<
        MinitigerHomeSettings,
        MinitigerColorThemeKey
    >;

export interface MinitigerColorThemePreset {
    id: string;
    name: string;
    description: string;
    colors: MinitigerColorTheme;
}

export const COLOR_THEME_PRESETS:
    MinitigerColorThemePreset[] = [
        {
            id: 'minitiger',
            name: 'Minitiger',
            description: 'Das goldene Minitiger-Standarddesign.',
            colors: {
                accentColor: '#ffbf00',
                primaryHoverColor: '#ffe152',
                secondaryColor: '#34373e',
                secondaryHoverColor: '#50545e',
                libraryBarColor: '#ffbf00',
                libraryBarTextColor: '#000000',
                bannerMetaColor: '#ffbf00',
                glowColor: '#ffbf00',
                arrowColor: '#ffbf00',
                genreTagColor: '#ffbf00'
            }
        },
        {
            id: 'taiga',
            name: 'Taiga',
            description: 'Warme Bernstein-, Kupfer- und Rottöne.',
            colors: {
                accentColor: '#e89b45',
                primaryHoverColor: '#f4c17a',
                secondaryColor: '#4b3030',
                secondaryHoverColor: '#684343',
                libraryBarColor: '#c9683c',
                libraryBarTextColor: '#fff7ed',
                bannerMetaColor: '#f0ad5f',
                glowColor: '#e77845',
                arrowColor: '#f0a555',
                genreTagColor: '#b9573f'
            }
        },
        {
            id: 'midnight',
            name: 'Midnight',
            description: 'Dunkles Violett für eine ruhige Nachtoptik.',
            colors: {
                accentColor: '#8b5cf6',
                primaryHoverColor: '#a78bfa',
                secondaryColor: '#1f2937',
                secondaryHoverColor: '#374151',
                libraryBarColor: '#312e81',
                libraryBarTextColor: '#f5f3ff',
                bannerMetaColor: '#c4b5fd',
                glowColor: '#7c3aed',
                arrowColor: '#a78bfa',
                genreTagColor: '#4c1d95'
            }
        },
        {
            id: 'ocean',
            name: 'Ocean',
            description: 'Kühle Cyan- und Meeresblautöne.',
            colors: {
                accentColor: '#22d3ee',
                primaryHoverColor: '#67e8f9',
                secondaryColor: '#164e63',
                secondaryHoverColor: '#155e75',
                libraryBarColor: '#0e7490',
                libraryBarTextColor: '#ecfeff',
                bannerMetaColor: '#67e8f9',
                glowColor: '#06b6d4',
                arrowColor: '#22d3ee',
                genreTagColor: '#0891b2'
            }
        },
        {
            id: 'sakura',
            name: 'Sakura',
            description: 'Pink, Rosé und dunkle Beerentöne.',
            colors: {
                accentColor: '#ff6fae',
                primaryHoverColor: '#ff9ac7',
                secondaryColor: '#4a2f3d',
                secondaryHoverColor: '#674254',
                libraryBarColor: '#d94f8a',
                libraryBarTextColor: '#fff7fb',
                bannerMetaColor: '#ff8fbd',
                glowColor: '#ff5fa2',
                arrowColor: '#ff7fb5',
                genreTagColor: '#c4457a'
            }
        },
        {
            id: 'emerald',
            name: 'Emerald',
            description: 'Sattes Grün mit dunklen Waldtönen.',
            colors: {
                accentColor: '#34d399',
                primaryHoverColor: '#6ee7b7',
                secondaryColor: '#1f3d35',
                secondaryHoverColor: '#2c564a',
                libraryBarColor: '#059669',
                libraryBarTextColor: '#ecfdf5',
                bannerMetaColor: '#6ee7b7',
                glowColor: '#10b981',
                arrowColor: '#34d399',
                genreTagColor: '#047857'
            }
        },
        {
            id: 'jelly-violet',
            name: 'Jelly Violett',
            description: 'Eine violette Optik, angelehnt an Jellyfin.',
            colors: {
                accentColor: '#aa5cc3',
                primaryHoverColor: '#c985dc',
                secondaryColor: '#2e2635',
                secondaryHoverColor: '#493b54',
                libraryBarColor: '#5b3f6e',
                libraryBarTextColor: '#ffffff',
                bannerMetaColor: '#c985dc',
                glowColor: '#aa5cc3',
                arrowColor: '#b96fd1',
                genreTagColor: '#7d4c91'
            }
        }
    ];

/* MINITIGER_PATCH_MARKER: PHASE_18_8_0_TEST_COLOR_TEMPLATES */

export const DEFAULT_HOME_SETTINGS: MinitigerHomeSettings = {
    accentColor: '#ffbf00',
    primaryHoverColor: '#ffe152',
    secondaryColor: '#34373e',
    secondaryHoverColor: '#50545e',
    libraryBarColor: '#ffbf00',
    libraryBarTextColor: '#000000',
    bannerMetaColor: '#ffbf00',
    glowColor: '#ffbf00',
    arrowColor: '#ffbf00',
    genreTagColor: '#ffbf00',
    glowStrength: 100,
    glowSize: 20,
    toolbarBrandLogoEnabled: false,
    toolbarBrandLogoUrl: '',
    toolbarBrandLogoSize: 44,
    toolbarBrandTextEnabled: false,
    toolbarBrandText: 'Minitiger',
    customHomeRowsEnabled: true,
    bannerEnabled: true,
    bannerHeightOffset: 0,
    bannerOverlayOffset: 0,
    bannerFadeSize: 110,
    bannerFadeStrength: 92,
    bannerNavigationVisible: true,
    bannerFskVisible: true,
    bannerRotationSeconds: 12,
    bannerItemLimit: 10,
    cardSize: 'normal',
    rowGap: 40,
    libraryCardWidth: 280,
    libraryCardGap: 16,
    libraryVirtualGap: 64,
    showLibraryNames: false,
    showAudioFlags: true,
    showFskBadges: true,
    showPlayedIndicators: true,
    playedIndicatorSize: 40,
    playedIndicatorFontSize: 15,
    playedIndicatorShape: 'round',
    trailerDebugEnabled: true,
    youtubeTrailersEnabled: true,
    sideRowTitlesEnabled: false,
    hoverEnabled: true,
    glowEnabled: true,
    previewEnabled: true,
    cardTextCentered: false,
    sectionOrder: [ ...HOME_SECTION_IDS ],
    homeRowOrder: [ ...DEFAULT_HOME_ROW_ORDER ],
    visibleSections: {
        libraries: true,
        resume: true,
        nextUp: true,
        watchlist: true,
        recent: true
    }
};

const isHomeSectionId = (value: unknown): value is HomeSectionId =>
    typeof value === 'string'
    && HOME_SECTION_IDS.includes(value as HomeSectionId);

export const isSystemHomeRowId = (
    value: unknown
): value is SystemHomeRowId =>
    typeof value === 'string'
    && SYSTEM_HOME_ROW_IDS.includes(
        value as SystemHomeRowId
    );

export const isVirtualHomeRowId = (
    value: unknown
): value is VirtualHomeRowId =>
    typeof value === 'string'
    && VIRTUAL_HOME_ROW_IDS.includes(
        value as VirtualHomeRowId
    );

export const isCustomHomeRowId = (
    value: unknown
): value is MinitigerCustomRowId => {
    if (typeof value !== 'string') {
        return false;
    }

    const match = /^custom(\d+)$/.exec(value);

    if (!match) {
        return false;
    }

    const number = Number(match[1]);

    return Number.isInteger(number)
        && number >= 1
        && number <= 30;
};

export const isHomeRowId = (
    value: unknown
): value is HomeRowId => (
    isSystemHomeRowId(value)
    || isVirtualHomeRowId(value)
    || isCustomHomeRowId(value)
);

const isHexColor = (value: unknown): value is string =>
    typeof value === 'string'
    && /^#[0-9a-f]{6}$/i.test(value);

const colorOr = (value: unknown, fallback: string) =>
    isHexColor(value) ? value : fallback;

const isCardSize = (value: unknown): value is MinitigerCardSize =>
    value === 'compact'
    || value === 'normal'
    || value === 'large';

const isRotationSeconds = (
    value: unknown
): value is BannerRotationSeconds =>
    value === 0
    || value === 8
    || value === 12
    || value === 20
    || value === 30
    || value === 45
    || value === 60;

const isPlayedIndicatorShape = (
    value: unknown
): value is PlayedIndicatorShape =>
    value === 'round'
    || value === 'circle'
    || value === 'square'
    || value === 'triangle';

const isBannerItemLimit = (
    value: unknown
): value is BannerItemLimit =>
    value === 0
    || value === 5
    || value === 10
    || value === 15
    || value === 20
    || value === 30
    || value === 50
    || value === 100;

const clampNumber = (
    value: unknown,
    fallback: number,
    min: number,
    max: number
) => {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, Math.round(numeric)));
};

export const normalizeHomeSettings = (
    value: unknown
): MinitigerHomeSettings => {
    if (!value || typeof value !== 'object') {
        return {
            ...DEFAULT_HOME_SETTINGS,
            sectionOrder: [
                ...DEFAULT_HOME_SETTINGS.sectionOrder
            ],
            homeRowOrder: [
                ...DEFAULT_HOME_SETTINGS.homeRowOrder
            ],
            visibleSections: {
                ...DEFAULT_HOME_SETTINGS.visibleSections
            }
        };
    }

    const source = value as Partial<MinitigerHomeSettings>;

    const incomingLegacyOrder = Array.isArray(source.sectionOrder)
        ? source.sectionOrder.filter(isHomeSectionId)
        : [];

    const legacyOrder = Array.from(new Set([
        ...incomingLegacyOrder,
        ...HOME_SECTION_IDS
    ])) as HomeSectionId[];

    const fallbackRowOrder = legacyOrder
        .filter((
            sectionId
        ): sectionId is SystemHomeRowId => (
            sectionId !== 'libraries'
            && isSystemHomeRowId(sectionId)
        ));

    const incomingRowOrder = Array.isArray(source.homeRowOrder)
        ? source.homeRowOrder.filter(isHomeRowId)
        : fallbackRowOrder;

    const homeRowOrder = Array.from(new Set([
        ...incomingRowOrder,
        ...DEFAULT_HOME_ROW_ORDER
    ])) as HomeRowId[];

    const incomingVisibility: Partial<
        Record<HomeSectionId, boolean>
    > = (
        source.visibleSections
        && typeof source.visibleSections === 'object'
    )
        ? source.visibleSections
        : {};

    const normalizedAccent = isHexColor(source.accentColor)
        ? (
            source.accentColor.toLowerCase() === '#e8a52c'
                ? '#ffbf00'
                : source.accentColor
        )
        : DEFAULT_HOME_SETTINGS.accentColor;

    const derivedLegacyOrder: HomeSectionId[] = [
        'libraries',
        ...homeRowOrder.filter(isSystemHomeRowId)
    ];

    return {
        accentColor: normalizedAccent,
        primaryHoverColor: colorOr(
            source.primaryHoverColor,
            DEFAULT_HOME_SETTINGS.primaryHoverColor
        ),
        secondaryColor: colorOr(
            source.secondaryColor,
            DEFAULT_HOME_SETTINGS.secondaryColor
        ),
        secondaryHoverColor: colorOr(
            source.secondaryHoverColor,
            DEFAULT_HOME_SETTINGS.secondaryHoverColor
        ),
        libraryBarColor: colorOr(
            source.libraryBarColor,
            normalizedAccent
        ),
        libraryBarTextColor: colorOr(
            source.libraryBarTextColor,
            DEFAULT_HOME_SETTINGS.libraryBarTextColor
        ),
        bannerMetaColor: colorOr(
            source.bannerMetaColor,
            normalizedAccent
        ),
        glowColor: colorOr(
            source.glowColor,
            normalizedAccent
        ),
        arrowColor: colorOr(
            source.arrowColor,
            normalizedAccent
        ),
        genreTagColor: colorOr(
            source.genreTagColor,
            normalizedAccent
        ),
        glowStrength: clampNumber(
            source.glowStrength,
            DEFAULT_HOME_SETTINGS.glowStrength,
            0,
            100
        ),
        glowSize: clampNumber(
            source.glowSize,
            DEFAULT_HOME_SETTINGS.glowSize,
            0,
            40
        ),
        toolbarBrandLogoEnabled:
            source.toolbarBrandLogoEnabled === true,
        toolbarBrandLogoUrl:
            typeof source.toolbarBrandLogoUrl === 'string'
                ? source.toolbarBrandLogoUrl.trim().slice(0, 240000)
                : DEFAULT_HOME_SETTINGS.toolbarBrandLogoUrl,
        toolbarBrandLogoSize: clampNumber(
            source.toolbarBrandLogoSize,
            DEFAULT_HOME_SETTINGS.toolbarBrandLogoSize,
            24,
            72
        ),
        toolbarBrandTextEnabled:
            source.toolbarBrandTextEnabled === true,
        toolbarBrandText:
            typeof source.toolbarBrandText === 'string'
                ? source.toolbarBrandText.slice(0, 40)
                : DEFAULT_HOME_SETTINGS.toolbarBrandText,
        customHomeRowsEnabled: source.customHomeRowsEnabled !== false,
        bannerEnabled: source.bannerEnabled !== false,
        bannerHeightOffset: clampNumber(
            source.bannerHeightOffset,
            DEFAULT_HOME_SETTINGS.bannerHeightOffset,
            -140,
            280
        ),
        bannerOverlayOffset: clampNumber(
            source.bannerOverlayOffset,
            DEFAULT_HOME_SETTINGS.bannerOverlayOffset,
            -120,
            120
        ),
        bannerFadeSize: clampNumber(
            source.bannerFadeSize,
            DEFAULT_HOME_SETTINGS.bannerFadeSize,
            0,
            320
        ),
        bannerFadeStrength: clampNumber(
            source.bannerFadeStrength,
            DEFAULT_HOME_SETTINGS.bannerFadeStrength,
            0,
            100
        ),
        bannerNavigationVisible: source.bannerNavigationVisible !== false,
        bannerFskVisible: source.bannerFskVisible !== false,
        bannerRotationSeconds:
            isRotationSeconds(source.bannerRotationSeconds)
                ? source.bannerRotationSeconds
                : DEFAULT_HOME_SETTINGS.bannerRotationSeconds,
        bannerItemLimit:
            isBannerItemLimit(source.bannerItemLimit)
                ? source.bannerItemLimit
                : DEFAULT_HOME_SETTINGS.bannerItemLimit,
        cardSize: isCardSize(source.cardSize)
            ? source.cardSize
            : DEFAULT_HOME_SETTINGS.cardSize,
        rowGap: clampNumber(
            source.rowGap,
            DEFAULT_HOME_SETTINGS.rowGap,
            12,
            90
        ),
        libraryCardWidth: clampNumber(
            source.libraryCardWidth,
            DEFAULT_HOME_SETTINGS.libraryCardWidth,
            180,
            480
        ),
        libraryCardGap: clampNumber(
            source.libraryCardGap,
            DEFAULT_HOME_SETTINGS.libraryCardGap,
            0,
            48
        ),
        libraryVirtualGap: clampNumber(
            source.libraryVirtualGap,
            DEFAULT_HOME_SETTINGS.libraryVirtualGap,
            -120,
            180
        ),
        showLibraryNames: source.showLibraryNames === true,
        showAudioFlags: source.showAudioFlags !== false,
        showFskBadges: source.showFskBadges !== false,
        showPlayedIndicators: source.showPlayedIndicators !== false,
        playedIndicatorSize: clampNumber(
            source.playedIndicatorSize,
            DEFAULT_HOME_SETTINGS.playedIndicatorSize,
            24,
            72
        ),
        playedIndicatorFontSize: clampNumber(
            source.playedIndicatorFontSize,
            DEFAULT_HOME_SETTINGS.playedIndicatorFontSize,
            10,
            30
        ),
        playedIndicatorShape:
            isPlayedIndicatorShape(source.playedIndicatorShape)
                ? source.playedIndicatorShape
                : DEFAULT_HOME_SETTINGS.playedIndicatorShape,
        trailerDebugEnabled: source.trailerDebugEnabled !== false,
        youtubeTrailersEnabled: source.youtubeTrailersEnabled !== false,
        sideRowTitlesEnabled: source.sideRowTitlesEnabled === true,
        hoverEnabled: source.hoverEnabled !== false,
        glowEnabled: source.glowEnabled !== false,
        previewEnabled: source.previewEnabled !== false,
        cardTextCentered:
            source.cardTextCentered === true,
        sectionOrder: derivedLegacyOrder,
        homeRowOrder,
        visibleSections: HOME_SECTION_IDS.reduce(
            (result, id) => ({
                ...result,
                [id]:
                    typeof incomingVisibility[id] === 'boolean'
                        ? incomingVisibility[id]
                        : DEFAULT_HOME_SETTINGS.visibleSections[id]
            }),
            {} as Record<HomeSectionId, boolean>
        )
    };
};

export const parseCardSize = (
    value: string
): MinitigerCardSize => {
    switch (value) {
        case 'compact':
        case 'large':
            return value;
        case 'normal':
        default:
            return 'normal';
    }
};

export const getContrastTextColor = (hex: string) => {
    const normalized = hex.replace('#', '');

    if (normalized.length !== 6) {
        return '#111111';
    }

    const red = parseInt(normalized.slice(0, 2), 16);
    const green = parseInt(normalized.slice(2, 4), 16);
    const blue = parseInt(normalized.slice(4, 6), 16);

    const luminance = (
        0.299 * red
        + 0.587 * green
        + 0.114 * blue
    );

    return luminance > 150 ? '#111111' : '#ffffff';
};

// MINITIGER_PATCH_MARKER: PHASE_18_18_3_CENTERED_CARD_TEXT_SETTING

// MINITIGER_PATCH_MARKER: PHASE_18_23_0A_VLC_PREFERENCE_BRIDGE_CHECK
