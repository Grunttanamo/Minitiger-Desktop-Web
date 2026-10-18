export type MinitigerVirtualDisplay = 'poster' | 'landscape';

export type MinitigerVirtualRowId = `virtual${number}`;
export const MAX_VIRTUAL_ROWS = 24;
export const VIRTUAL_ROW_IDS = Array.from({ length: MAX_VIRTUAL_ROWS }, (_, i) => `virtual${i + 1}` as MinitigerVirtualRowId);

export interface MinitigerVirtualLibrary {
    id: string;
    name: string;
    image: string;
    logo?: string;
    videoKey?: string;
    imageRevision?: number;
    logoRevision?: number;
    videoRevision?: number;
    display: MinitigerVirtualDisplay;
    enabled: boolean;
    showCaption: boolean;
    itemIds: string[];
    rowId: MinitigerVirtualRowId;
}

export interface MinitigerVirtualLibrariesConfig {
    libraries: MinitigerVirtualLibrary[];
    homeOrder: string[];
    homeCardWidth: number;
    homeGap: number;
    rowGaps: Record<MinitigerVirtualRowId, number>;
    pagePosterWidth: number;
    pageLandscapeWidth: number;
    pageGap: number;
    rowEnabled: Record<MinitigerVirtualRowId, boolean>;
    rowTitles: Record<MinitigerVirtualRowId, string>;
    rowTitleVisible: Record<MinitigerVirtualRowId, boolean>;
}

export const DEFAULT_VIRTUAL_LIBRARIES: MinitigerVirtualLibrariesConfig = {
    libraries: [],
    homeOrder: [],
    homeCardWidth: 300,
    homeGap: 80,
    rowGaps: {} as Record<MinitigerVirtualRowId, number>,
    pagePosterWidth: 320,
    pageLandscapeWidth: 520,
    pageGap: 23,
    rowEnabled: Object.fromEntries(VIRTUAL_ROW_IDS.map(id => [id, true])) as Record<MinitigerVirtualRowId, boolean>,
    rowTitles: Object.fromEntries(VIRTUAL_ROW_IDS.map(id => [id, 'Virtuelle Bibliotheken'])) as Record<MinitigerVirtualRowId, string>,
    rowTitleVisible: Object.fromEntries(VIRTUAL_ROW_IDS.map(id => [id, true])) as Record<MinitigerVirtualRowId, boolean>
};

const cleanId = (value: unknown, fallback: string) => {
    const normalized = String(value ?? '')
        .replace(/[^A-Za-z0-9_-]/g, '')
        .slice(0, 64);

    return normalized || fallback;
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
        Math.max(min, Math.round(numeric))
    );
};

export const normalizeVirtualLibraries = (
    value: unknown
): MinitigerVirtualLibrariesConfig => {
    if (!value || typeof value !== 'object') {
        return {
            ...DEFAULT_VIRTUAL_LIBRARIES,
            libraries: [],
            homeOrder: [],
            rowEnabled: {
                ...DEFAULT_VIRTUAL_LIBRARIES.rowEnabled
            },
            rowTitles: {
                ...DEFAULT_VIRTUAL_LIBRARIES.rowTitles
            },
            rowTitleVisible: {
                ...DEFAULT_VIRTUAL_LIBRARIES.rowTitleVisible
            }
        };
    }

    const source = value as Partial<MinitigerVirtualLibrariesConfig>;
    const rawLibraries = Array.isArray(source.libraries)
        ? source.libraries
        : [];

    const libraries: MinitigerVirtualLibrary[] = [];
    const usedIds = new Set<string>();

    rawLibraries.slice(0, 24).forEach((entry, index) => {
        if (!entry || typeof entry !== 'object') {
            return;
        }

        const raw = entry as Partial<MinitigerVirtualLibrary>;
        let id = cleanId(raw.id, `virtual${index + 1}`);

        while (usedIds.has(id)) {
            id = `${id}-${index + 1}`;
        }

        usedIds.add(id);

        const itemIds = Array.isArray(raw.itemIds)
            ? Array.from(new Set(
                raw.itemIds
                    .map(itemId => String(itemId ?? '').trim())
                    .filter(Boolean)
            )).slice(0, 5000)
            : [];

        libraries.push({
            id,
            name: String(
                raw.name ?? `Virtuelle Bibliothek ${index + 1}`
            ).trim().slice(0, 80)
                || `Virtuelle Bibliothek ${index + 1}`,
            image: String(raw.image ?? '').slice(0, 1_500_000),
            logo: String(raw.logo ?? '').slice(0, 1_500_000),
            videoKey: String(raw.videoKey ?? '')
                .replace(/[^A-Za-z0-9_-]/g, '')
                .slice(0, 128),
            imageRevision: clamp(
                raw.imageRevision,
                0,
                0,
                Number.MAX_SAFE_INTEGER
            ),
            logoRevision: clamp(
                raw.logoRevision,
                0,
                0,
                Number.MAX_SAFE_INTEGER
            ),
            videoRevision: clamp(
                raw.videoRevision,
                0,
                0,
                Number.MAX_SAFE_INTEGER
            ),
            display: raw.display === 'landscape'
                ? 'landscape'
                : 'poster',
            enabled: raw.enabled !== false,
            showCaption: raw.showCaption !== false,
            itemIds,
            rowId: VIRTUAL_ROW_IDS.includes(raw.rowId as MinitigerVirtualRowId)
                ? raw.rowId as MinitigerVirtualRowId
                : VIRTUAL_ROW_IDS[Math.min(2, Math.floor(index / 8))]
        });
    });

    const knownIds = new Set(
        libraries.map(library => library.id)
    );

    const requestedOrder = Array.isArray(source.homeOrder)
        ? source.homeOrder
            .map(id => String(id ?? ''))
            .filter(id => knownIds.has(id))
        : [];

    const homeOrder = Array.from(new Set([
        ...requestedOrder,
        ...libraries.map(library => library.id)
    ]));

    const rowEnabled = Object.fromEntries(VIRTUAL_ROW_IDS.map(id => [id, source.rowEnabled?.[id] !== false])) as Record<MinitigerVirtualRowId, boolean>;
    const rowTitles = Object.fromEntries(VIRTUAL_ROW_IDS.map(id => [id, String(source.rowTitles?.[id] ?? 'Virtuelle Bibliotheken').slice(0, 80)])) as Record<MinitigerVirtualRowId, string>;
    const rowTitleVisible = Object.fromEntries(VIRTUAL_ROW_IDS.map(id => [id, source.rowTitleVisible?.[id] !== false])) as Record<MinitigerVirtualRowId, boolean>;

    return {
        libraries,
        homeOrder,
        homeCardWidth: clamp(
            source.homeCardWidth,
            DEFAULT_VIRTUAL_LIBRARIES.homeCardWidth,
            180,
            520
        ),
        rowGaps: Object.fromEntries(VIRTUAL_ROW_IDS.map(id => {
            const raw = source.rowGaps?.[id];
            const parsed = typeof raw === 'number' ? raw : Number(raw);
            return [id, raw !== undefined && Number.isFinite(parsed) && parsed >= 0
                ? Math.min(1000000, Math.round(parsed)) : clamp(source.homeGap, 80, 4, 80)];
        })) as Record<MinitigerVirtualRowId, number>,
        homeGap: clamp(
            source.homeGap,
            DEFAULT_VIRTUAL_LIBRARIES.homeGap,
            4,
            80
        ),
        pagePosterWidth: clamp(
            source.pagePosterWidth,
            DEFAULT_VIRTUAL_LIBRARIES.pagePosterWidth,
            110,
            360
        ),
        pageLandscapeWidth: clamp(
            source.pageLandscapeWidth,
            DEFAULT_VIRTUAL_LIBRARIES.pageLandscapeWidth,
            180,
            620
        ),
        pageGap: clamp(
            source.pageGap,
            DEFAULT_VIRTUAL_LIBRARIES.pageGap,
            4,
            32
        ),
        rowEnabled,
        rowTitles,
        rowTitleVisible
    };
};
