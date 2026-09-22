export type MinitigerCustomRowId = `custom${number}`;
export type MinitigerCustomSortMode = 'latestItems' | 'latestTitles' | 'latestSeasons';
export type MinitigerCustomDisplay = 'poster' | 'landscape';

export interface MinitigerCustomRow {
    key: MinitigerCustomRowId;
    title: string;
    library1: string;
    library2: string;
    sortMode: MinitigerCustomSortMode;
    display: MinitigerCustomDisplay;
    count: number;
    cardScale: number;
    gap: number;
    showTitle: boolean;
    enabled: boolean;
}

export interface MinitigerCustomRowsConfig {
    rows: MinitigerCustomRow[];
}

export const CUSTOM_ROW_IDS: MinitigerCustomRowId[] =
    Array.from(
        { length: 30 },
        (_, index) => `custom${index + 1}` as MinitigerCustomRowId
    );

export const DEFAULT_CUSTOM_ROWS: MinitigerCustomRowsConfig = {
    rows: CUSTOM_ROW_IDS.map((key, index) => ({
        key,
        title: `Custom Reihe ${index + 1}`,
        library1: '',
        library2: '',
        sortMode: 'latestItems',
        display: 'poster',
        count: 10,
        cardScale: 100,
        gap: 16,
        showTitle: true,
        enabled: false
    }))
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

export const normalizeCustomRows = (
    value: unknown
): MinitigerCustomRowsConfig => {
    if (!value || typeof value !== 'object') {
        return {
            rows: DEFAULT_CUSTOM_ROWS.rows.map(row => ({
                ...row
            }))
        };
    }

    const source = value as Partial<MinitigerCustomRowsConfig>;
    const sourceRows = Array.isArray(source.rows)
        ? source.rows
        : [];

    const byKey = new Map<string, Partial<MinitigerCustomRow>>();

    sourceRows.forEach(row => {
        if (row?.key) {
            byKey.set(String(row.key), row);
        }
    });

    return {
        rows: DEFAULT_CUSTOM_ROWS.rows.map(defaultRow => {
            const candidate = byKey.get(defaultRow.key);

            if (!candidate) {
                return { ...defaultRow };
            }

            return {
                key: defaultRow.key,
                title: String(
                    candidate.title ?? defaultRow.title
                ).slice(0, 80) || defaultRow.title,
                library1: String(
                    candidate.library1 ?? ''
                ),
                library2: String(
                    candidate.library2 ?? ''
                ),
                sortMode:
                    candidate.sortMode === 'latestTitles'
                        ? 'latestTitles'
                        : candidate.sortMode === 'latestSeasons'
                            ? 'latestSeasons'
                            : 'latestItems',
                display:
                    candidate.display === 'landscape'
                        ? 'landscape'
                        : 'poster',
                count: clamp(
                    candidate.count,
                    defaultRow.count,
                    3,
                    50
                ),
                cardScale: clamp(
                    candidate.cardScale,
                    defaultRow.cardScale,
                    60,
                    160
                ),
                gap: clamp(
                    candidate.gap,
                    defaultRow.gap,
                    4,
                    48
                ),
                showTitle: candidate.showTitle !== false,
                enabled: candidate.enabled === true
            };
        })
    };
};

// MINITIGER_PATCH_MARKER: PHASE_18_18_0_LATEST_SEASONS_MODE
