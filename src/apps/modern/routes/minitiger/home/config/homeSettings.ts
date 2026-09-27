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

export type SystemHomeRowLayoutMap =
    Record<SystemHomeRowId, number>;

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
    toolbarTransparency: number;
    toolbarGlassBlur: number;
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
    bannerRotationEnabled: boolean;
    bannerRotationSeconds: BannerRotationSeconds;
    bannerItemLimit: BannerItemLimit;
    cardSize: MinitigerCardSize;
    rowGap: number;
    systemRowCardScale: SystemHomeRowLayoutMap;
    systemRowGap: SystemHomeRowLayoutMap;
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
    localTrailersEnabled: boolean;
    bannerTrailerButtonEnabled: boolean;
    trailerDownloadEnabled: boolean;
    sideRowTitlesEnabled: boolean;
    hoverEnabled: boolean;
    glowEnabled: boolean;
    previewEnabled: boolean;
    previewSeriesEnabled: boolean;
    previewMovieEnabled: boolean;
    previewMangaEnabled: boolean;
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
        },
        {
            id: 'sunset',
            name: 'Sunset',
            description: 'Orange, Koralle und warme Abendtöne.',
            colors: {
                accentColor: '#ff7a18',
                primaryHoverColor: '#ffb15c',
                secondaryColor: '#4a2a2a',
                secondaryHoverColor: '#6b3b32',
                libraryBarColor: '#c2410c',
                libraryBarTextColor: '#fff7ed',
                bannerMetaColor: '#fdba74',
                glowColor: '#f97316',
                arrowColor: '#fb923c',
                genreTagColor: '#ea580c'
            }
        },
        {
            id: 'crimson',
            name: 'Crimson',
            description: 'Kräftiges Rot mit dunklem Weinrot.',
            colors: {
                accentColor: '#dc2626',
                primaryHoverColor: '#f87171',
                secondaryColor: '#3b1f24',
                secondaryHoverColor: '#5a2931',
                libraryBarColor: '#991b1b',
                libraryBarTextColor: '#fff1f2',
                bannerMetaColor: '#fca5a5',
                glowColor: '#ef4444',
                arrowColor: '#f87171',
                genreTagColor: '#b91c1c'
            }
        },
        {
            id: 'ruby',
            name: 'Ruby',
            description: 'Rubinrot mit eleganten Beerentönen.',
            colors: {
                accentColor: '#e11d48',
                primaryHoverColor: '#fb7185',
                secondaryColor: '#401f2a',
                secondaryHoverColor: '#5f2b3b',
                libraryBarColor: '#9f1239',
                libraryBarTextColor: '#fff1f2',
                bannerMetaColor: '#fda4af',
                glowColor: '#f43f5e',
                arrowColor: '#fb7185',
                genreTagColor: '#be123c'
            }
        },
        {
            id: 'rose',
            name: 'Rose',
            description: 'Sanftes Rosa mit satten Rosétönen.',
            colors: {
                accentColor: '#f43f5e',
                primaryHoverColor: '#fda4af',
                secondaryColor: '#44242e',
                secondaryHoverColor: '#633443',
                libraryBarColor: '#be123c',
                libraryBarTextColor: '#fff1f2',
                bannerMetaColor: '#fecdd3',
                glowColor: '#fb7185',
                arrowColor: '#fda4af',
                genreTagColor: '#e11d48'
            }
        },
        {
            id: 'peach',
            name: 'Peach',
            description: 'Pfirsich, Apricot und warme Cremefarben.',
            colors: {
                accentColor: '#fb8b5b',
                primaryHoverColor: '#ffc09f',
                secondaryColor: '#4a302b',
                secondaryHoverColor: '#68443b',
                libraryBarColor: '#e76f51',
                libraryBarTextColor: '#fff8f2',
                bannerMetaColor: '#ffd1b8',
                glowColor: '#ff8a5b',
                arrowColor: '#ffa27a',
                genreTagColor: '#d65f43'
            }
        },
        {
            id: 'amber',
            name: 'Amber',
            description: 'Honiggelb, Bernstein und dunkles Gold.',
            colors: {
                accentColor: '#f59e0b',
                primaryHoverColor: '#fcd34d',
                secondaryColor: '#3f321d',
                secondaryHoverColor: '#594728',
                libraryBarColor: '#b45309',
                libraryBarTextColor: '#fffbeb',
                bannerMetaColor: '#fde68a',
                glowColor: '#f59e0b',
                arrowColor: '#fbbf24',
                genreTagColor: '#d97706'
            }
        },
        {
            id: 'lime',
            name: 'Lime',
            description: 'Frisches Limettengrün mit dunkler Olive.',
            colors: {
                accentColor: '#84cc16',
                primaryHoverColor: '#bef264',
                secondaryColor: '#2f3b1e',
                secondaryHoverColor: '#45552b',
                libraryBarColor: '#4d7c0f',
                libraryBarTextColor: '#f7fee7',
                bannerMetaColor: '#d9f99d',
                glowColor: '#84cc16',
                arrowColor: '#a3e635',
                genreTagColor: '#65a30d'
            }
        },
        {
            id: 'forest',
            name: 'Forest',
            description: 'Tiefes Waldgrün mit natürlichen Akzenten.',
            colors: {
                accentColor: '#16a34a',
                primaryHoverColor: '#4ade80',
                secondaryColor: '#183528',
                secondaryHoverColor: '#24503a',
                libraryBarColor: '#166534',
                libraryBarTextColor: '#f0fdf4',
                bannerMetaColor: '#86efac',
                glowColor: '#22c55e',
                arrowColor: '#4ade80',
                genreTagColor: '#15803d'
            }
        },
        {
            id: 'mint',
            name: 'Mint',
            description: 'Helles Mint mit kühlen Aquatönen.',
            colors: {
                accentColor: '#2dd4bf',
                primaryHoverColor: '#99f6e4',
                secondaryColor: '#1d3b39',
                secondaryHoverColor: '#285650',
                libraryBarColor: '#0f766e',
                libraryBarTextColor: '#f0fdfa',
                bannerMetaColor: '#99f6e4',
                glowColor: '#14b8a6',
                arrowColor: '#5eead4',
                genreTagColor: '#0d9488'
            }
        },
        {
            id: 'teal',
            name: 'Teal',
            description: 'Dunkles Türkis mit klaren Cyan-Akzenten.',
            colors: {
                accentColor: '#14b8a6',
                primaryHoverColor: '#5eead4',
                secondaryColor: '#173b3d',
                secondaryHoverColor: '#205458',
                libraryBarColor: '#0f766e',
                libraryBarTextColor: '#f0fdfa',
                bannerMetaColor: '#99f6e4',
                glowColor: '#0d9488',
                arrowColor: '#2dd4bf',
                genreTagColor: '#115e59'
            }
        },
        {
            id: 'arctic',
            name: 'Arctic',
            description: 'Eisblau und helle Frosttöne.',
            colors: {
                accentColor: '#38bdf8',
                primaryHoverColor: '#bae6fd',
                secondaryColor: '#203544',
                secondaryHoverColor: '#2d4b60',
                libraryBarColor: '#0369a1',
                libraryBarTextColor: '#f0f9ff',
                bannerMetaColor: '#bae6fd',
                glowColor: '#0ea5e9',
                arrowColor: '#7dd3fc',
                genreTagColor: '#0284c7'
            }
        },
        {
            id: 'azure',
            name: 'Azure',
            description: 'Klares Himmelblau mit tiefem Azur.',
            colors: {
                accentColor: '#0ea5e9',
                primaryHoverColor: '#7dd3fc',
                secondaryColor: '#1e3445',
                secondaryHoverColor: '#294a61',
                libraryBarColor: '#0369a1',
                libraryBarTextColor: '#f0f9ff',
                bannerMetaColor: '#7dd3fc',
                glowColor: '#0284c7',
                arrowColor: '#38bdf8',
                genreTagColor: '#075985'
            }
        },
        {
            id: 'cobalt',
            name: 'Cobalt',
            description: 'Kräftiges Kobaltblau mit dunklem Navy.',
            colors: {
                accentColor: '#2563eb',
                primaryHoverColor: '#60a5fa',
                secondaryColor: '#202c46',
                secondaryHoverColor: '#2d3f64',
                libraryBarColor: '#1d4ed8',
                libraryBarTextColor: '#eff6ff',
                bannerMetaColor: '#93c5fd',
                glowColor: '#3b82f6',
                arrowColor: '#60a5fa',
                genreTagColor: '#1e40af'
            }
        },
        {
            id: 'royal',
            name: 'Royal',
            description: 'Königsblau und Indigo mit kühler Tiefe.',
            colors: {
                accentColor: '#4f46e5',
                primaryHoverColor: '#818cf8',
                secondaryColor: '#29294a',
                secondaryHoverColor: '#3b3b68',
                libraryBarColor: '#3730a3',
                libraryBarTextColor: '#eef2ff',
                bannerMetaColor: '#a5b4fc',
                glowColor: '#6366f1',
                arrowColor: '#818cf8',
                genreTagColor: '#4338ca'
            }
        },
        {
            id: 'lavender',
            name: 'Lavender',
            description: 'Sanftes Lavendel mit dunklem Flieder.',
            colors: {
                accentColor: '#a78bfa',
                primaryHoverColor: '#c4b5fd',
                secondaryColor: '#382f4a',
                secondaryHoverColor: '#504368',
                libraryBarColor: '#7c3aed',
                libraryBarTextColor: '#faf5ff',
                bannerMetaColor: '#ddd6fe',
                glowColor: '#8b5cf6',
                arrowColor: '#c4b5fd',
                genreTagColor: '#6d28d9'
            }
        },
        {
            id: 'amethyst',
            name: 'Amethyst',
            description: 'Sattes Violett mit leuchtendem Amethyst.',
            colors: {
                accentColor: '#9333ea',
                primaryHoverColor: '#c084fc',
                secondaryColor: '#35223f',
                secondaryHoverColor: '#4d315c',
                libraryBarColor: '#6b21a8',
                libraryBarTextColor: '#faf5ff',
                bannerMetaColor: '#d8b4fe',
                glowColor: '#a855f7',
                arrowColor: '#c084fc',
                genreTagColor: '#7e22ce'
            }
        },
        {
            id: 'grape',
            name: 'Grape',
            description: 'Dunkle Traube mit kräftigem Purpur.',
            colors: {
                accentColor: '#7e22ce',
                primaryHoverColor: '#a855f7',
                secondaryColor: '#31203b',
                secondaryHoverColor: '#482d56',
                libraryBarColor: '#581c87',
                libraryBarTextColor: '#faf5ff',
                bannerMetaColor: '#d8b4fe',
                glowColor: '#9333ea',
                arrowColor: '#a855f7',
                genreTagColor: '#6b21a8'
            }
        },
        {
            id: 'neon',
            name: 'Neon',
            description: 'Leuchtendes Grün und Cyan auf dunklem Grund.',
            colors: {
                accentColor: '#22c55e',
                primaryHoverColor: '#86efac',
                secondaryColor: '#172b2a',
                secondaryHoverColor: '#21423f',
                libraryBarColor: '#0891b2',
                libraryBarTextColor: '#ecfeff',
                bannerMetaColor: '#67e8f9',
                glowColor: '#22d3ee',
                arrowColor: '#4ade80',
                genreTagColor: '#06b6d4'
            }
        },
        {
            id: 'cyberpunk',
            name: 'Cyberpunk',
            description: 'Neongelb, Pink und dunkles Violett.',
            colors: {
                accentColor: '#facc15',
                primaryHoverColor: '#fde047',
                secondaryColor: '#351d46',
                secondaryHoverColor: '#51285f',
                libraryBarColor: '#db2777',
                libraryBarTextColor: '#fff7ed',
                bannerMetaColor: '#f9a8d4',
                glowColor: '#ec4899',
                arrowColor: '#facc15',
                genreTagColor: '#a21caf'
            }
        },
        {
            id: 'monochrome',
            name: 'Monochrom',
            description: 'Schwarz, Weiß und klare Grauabstufungen.',
            colors: {
                accentColor: '#e5e7eb',
                primaryHoverColor: '#ffffff',
                secondaryColor: '#27272a',
                secondaryHoverColor: '#3f3f46',
                libraryBarColor: '#52525b',
                libraryBarTextColor: '#ffffff',
                bannerMetaColor: '#d4d4d8',
                glowColor: '#a1a1aa',
                arrowColor: '#e4e4e7',
                genreTagColor: '#71717a'
            }
        },
        {
            id: 'silver',
            name: 'Silver',
            description: 'Kühles Silber mit blaugrauen Akzenten.',
            colors: {
                accentColor: '#94a3b8',
                primaryHoverColor: '#cbd5e1',
                secondaryColor: '#27303d',
                secondaryHoverColor: '#3b4656',
                libraryBarColor: '#475569',
                libraryBarTextColor: '#f8fafc',
                bannerMetaColor: '#cbd5e1',
                glowColor: '#64748b',
                arrowColor: '#94a3b8',
                genreTagColor: '#475569'
            }
        },
        {
            id: 'coffee',
            name: 'Coffee',
            description: 'Kaffee, Karamell und warme Brauntöne.',
            colors: {
                accentColor: '#b7793f',
                primaryHoverColor: '#d9a066',
                secondaryColor: '#3a2b26',
                secondaryHoverColor: '#554039',
                libraryBarColor: '#7c4a2d',
                libraryBarTextColor: '#fff7ed',
                bannerMetaColor: '#e7b98b',
                glowColor: '#a86636',
                arrowColor: '#c58b55',
                genreTagColor: '#8a5634'
            }
        },
        {
            id: 'halloween',
            name: 'Halloween',
            description: 'Kürbisorange, Violett und tiefe Nachttöne.',
            colors: {
                accentColor: '#f97316',
                primaryHoverColor: '#fb923c',
                secondaryColor: '#2f213b',
                secondaryHoverColor: '#49305c',
                libraryBarColor: '#7e22ce',
                libraryBarTextColor: '#fff7ed',
                bannerMetaColor: '#fdba74',
                glowColor: '#a855f7',
                arrowColor: '#f97316',
                genreTagColor: '#9333ea'
            }
        },
        {
            id: 'cherry',
            name: 'Cherry',
            description: 'Kirschrot mit dunkler Schokolade.',
            colors: {
                accentColor: '#be123c',
                primaryHoverColor: '#fb7185',
                secondaryColor: '#351f25',
                secondaryHoverColor: '#50303a',
                libraryBarColor: '#881337',
                libraryBarTextColor: '#fff1f2',
                bannerMetaColor: '#fda4af',
                glowColor: '#e11d48',
                arrowColor: '#fb7185',
                genreTagColor: '#9f1239'
            }
        },
        {
            id: 'candy',
            name: 'Candy',
            description: 'Verspieltes Pink, Türkis und Violett.',
            colors: {
                accentColor: '#ec4899',
                primaryHoverColor: '#f9a8d4',
                secondaryColor: '#3b2946',
                secondaryHoverColor: '#563b64',
                libraryBarColor: '#8b5cf6',
                libraryBarTextColor: '#fff7fb',
                bannerMetaColor: '#67e8f9',
                glowColor: '#22d3ee',
                arrowColor: '#f472b6',
                genreTagColor: '#a855f7'
            }
        },
        {
            id: 'solar',
            name: 'Solar',
            description: 'Sonnengelb mit kräftigem Orange.',
            colors: {
                accentColor: '#fbbf24',
                primaryHoverColor: '#fde68a',
                secondaryColor: '#40321d',
                secondaryHoverColor: '#5d4828',
                libraryBarColor: '#ea580c',
                libraryBarTextColor: '#fff7ed',
                bannerMetaColor: '#fed7aa',
                glowColor: '#f59e0b',
                arrowColor: '#fbbf24',
                genreTagColor: '#d97706'
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
    toolbarTransparency: 90,
    toolbarGlassBlur: 5,
    toolbarBrandTextEnabled: false,
    toolbarBrandText: 'Minitiger',
    customHomeRowsEnabled: true,
    bannerEnabled: true,
    bannerHeightOffset: 280,
    bannerOverlayOffset: 70,
    bannerFadeSize: 320,
    bannerFadeStrength: 100,
    bannerNavigationVisible: true,
    bannerFskVisible: false,
    bannerRotationEnabled: true,
    bannerRotationSeconds: 60,
    bannerItemLimit: 10,
    cardSize: 'normal',
    rowGap: 12,
    systemRowCardScale: {
        resume: 100,
        nextUp: 100,
        watchlist: 100,
        recent: 100
    },
    systemRowGap: {
        resume: 16,
        nextUp: 16,
        watchlist: 16,
        recent: 16
    },
    libraryCardWidth: 280,
    libraryCardGap: 16,
    libraryVirtualGap: -120,
    showLibraryNames: false,
    showAudioFlags: true,
    showFskBadges: true,
    showPlayedIndicators: true,
    playedIndicatorSize: 32,
    playedIndicatorFontSize: 13,
    playedIndicatorShape: 'circle',
    trailerDebugEnabled: false,
    youtubeTrailersEnabled: true,
    localTrailersEnabled: false,
    bannerTrailerButtonEnabled: false,
    trailerDownloadEnabled: false,
    sideRowTitlesEnabled: false,
    hoverEnabled: true,
    glowEnabled: true,
    previewEnabled: true,
    previewSeriesEnabled: true,
    previewMovieEnabled: true,
    previewMangaEnabled: true,
    cardTextCentered: true,
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
            },
            systemRowCardScale: {
                ...DEFAULT_HOME_SETTINGS.systemRowCardScale
            },
            systemRowGap: {
                ...DEFAULT_HOME_SETTINGS.systemRowGap
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

    const incomingSystemRowCardScale:
        Partial<SystemHomeRowLayoutMap> = (
        source.systemRowCardScale
        && typeof source.systemRowCardScale === 'object'
    )
        ? source.systemRowCardScale
        : {};

    const incomingSystemRowGap:
        Partial<SystemHomeRowLayoutMap> = (
        source.systemRowGap
        && typeof source.systemRowGap === 'object'
    )
        ? source.systemRowGap
        : {};

    const systemRowCardScale =
        SYSTEM_HOME_ROW_IDS.reduce(
            (result, id) => ({
                ...result,
                [id]: clampNumber(
                    incomingSystemRowCardScale[id],
                    DEFAULT_HOME_SETTINGS
                        .systemRowCardScale[id],
                    60,
                    160
                )
            }),
            {} as SystemHomeRowLayoutMap
        );

    const systemRowGap =
        SYSTEM_HOME_ROW_IDS.reduce(
            (result, id) => ({
                ...result,
                [id]: clampNumber(
                    incomingSystemRowGap[id],
                    DEFAULT_HOME_SETTINGS
                        .systemRowGap[id],
                    4,
                    48
                )
            }),
            {} as SystemHomeRowLayoutMap
        );

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
        toolbarTransparency: clampNumber(
            source.toolbarTransparency,
            DEFAULT_HOME_SETTINGS.toolbarTransparency,
            0,
            100
        ),
        toolbarGlassBlur: clampNumber(
            source.toolbarGlassBlur,
            DEFAULT_HOME_SETTINGS.toolbarGlassBlur,
            0,
            40
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
        bannerFskVisible:
            typeof source.bannerFskVisible === 'boolean'
                ? source.bannerFskVisible
                : DEFAULT_HOME_SETTINGS.bannerFskVisible,
        bannerRotationEnabled:
            typeof source.bannerRotationEnabled === 'boolean'
                ? source.bannerRotationEnabled
                : source.bannerRotationSeconds !== 0,
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
        systemRowCardScale,
        systemRowGap,
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
        trailerDebugEnabled:
            typeof source.trailerDebugEnabled === 'boolean'
                ? source.trailerDebugEnabled
                : DEFAULT_HOME_SETTINGS.trailerDebugEnabled,
        youtubeTrailersEnabled: source.youtubeTrailersEnabled !== false,
        localTrailersEnabled:
            typeof source.localTrailersEnabled === 'boolean'
                ? source.localTrailersEnabled
                : DEFAULT_HOME_SETTINGS.localTrailersEnabled,
        bannerTrailerButtonEnabled:
            typeof source.bannerTrailerButtonEnabled === 'boolean'
                ? source.bannerTrailerButtonEnabled
                : DEFAULT_HOME_SETTINGS.bannerTrailerButtonEnabled,
        trailerDownloadEnabled: source.trailerDownloadEnabled === true,
        sideRowTitlesEnabled: source.sideRowTitlesEnabled === true,
        hoverEnabled: source.hoverEnabled !== false,
        glowEnabled: source.glowEnabled !== false,
        previewEnabled: source.previewEnabled !== false,
        previewSeriesEnabled: source.previewSeriesEnabled !== false,
        previewMovieEnabled: source.previewMovieEnabled !== false,
        previewMangaEnabled: source.previewMangaEnabled !== false,
        cardTextCentered:
            typeof source.cardTextCentered === 'boolean'
                ? source.cardTextCentered
                : DEFAULT_HOME_SETTINGS.cardTextCentered,
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
