import type { ApiClient } from 'jellyfin-apiclient';

import type { ItemDto } from 'types/base/models/item-dto';

import { getEmbeddedFlagUrl } from './embeddedFlags';

const getMinitigerImageRevision = (
    item: ItemDto
) => Number(
    (
        item as ItemDto & {
            __minitigerImageRevision?: number;
        }
    ).__minitigerImageRevision
    ?? 0
);

const safeImageUrl = (
    apiClient: ApiClient | undefined,
    itemId: string | null | undefined,
    options: Record<string, unknown>,
    revision = 0
) => {
    if (!apiClient || !itemId) {
        return undefined;
    }

    try {
        const url =
            apiClient.getImageUrl(
                itemId,
                options
            );

        if (!url) {
            return undefined;
        }

        if (!revision) {
            return url;
        }

        return `${url}${
            url.includes('?')
                ? '&'
                : '?'
        }minitigerRevision=${revision}`;
    } catch {
        return undefined;
    }
};

export const getPrimaryImageUrl = (
    apiClient: ApiClient | undefined,
    item: ItemDto
) => {
    const tag = item.ImageTags?.Primary;

    if (!tag) {
        return undefined;
    }

    return safeImageUrl(
        apiClient,
        item.Id,
        {
            type: 'Primary',
            tag,
            maxWidth: 420,
            quality: 90
        },
        getMinitigerImageRevision(item)
    );
};

export const getLandscapeImageUrl = (
    apiClient: ApiClient | undefined,
    item: ItemDto
) => {
    const thumbTag = item.ImageTags?.Thumb;

    if (thumbTag) {
        return safeImageUrl(
            apiClient,
            item.Id,
            {
                type: 'Thumb',
                tag: thumbTag,
                maxWidth: 720,
                quality: 90
            },
            getMinitigerImageRevision(item)
        );
    }

    const backdropTag = item.BackdropImageTags?.[0];

    if (backdropTag) {
        return safeImageUrl(
            apiClient,
            item.Id,
            {
                type: 'Backdrop',
                tag: backdropTag,
                index: 0,
                maxWidth: 720,
                quality: 90
            },
            getMinitigerImageRevision(item)
        );
    }

    return getPrimaryImageUrl(apiClient, item);
};


export const getParentLandscapeImageUrl = (
    apiClient: ApiClient | undefined,
    item: ItemDto
) => {
    const type = String(item.Type ?? '').toLowerCase();

    if (type === 'episode' || type === 'season') {
        const seriesThumbTag = item.SeriesThumbImageTag;

        if (seriesThumbTag && item.SeriesId) {
            return safeImageUrl(apiClient, item.SeriesId, {
                type: 'Thumb',
                tag: seriesThumbTag,
                maxWidth: 900,
                quality: 92
            });
        }

        const parentThumbTag = item.ParentThumbImageTag;

        if (parentThumbTag && item.ParentThumbItemId) {
            return safeImageUrl(
                apiClient,
                item.ParentThumbItemId,
                {
                    type: 'Thumb',
                    tag: parentThumbTag,
                    maxWidth: 900,
                    quality: 92
                }
            );
        }

        const parentBackdropTag =
            item.ParentBackdropImageTags?.[0];

        if (
            parentBackdropTag
            && item.ParentBackdropItemId
        ) {
            return safeImageUrl(
                apiClient,
                item.ParentBackdropItemId,
                {
                    type: 'Backdrop',
                    tag: parentBackdropTag,
                    index: 0,
                    maxWidth: 900,
                    quality: 92
                }
            );
        }
    }

    return getLandscapeImageUrl(apiClient, item);
};

export const getBackdropImageUrl = (
    apiClient: ApiClient | undefined,
    item: ItemDto
) => {
    const backdropTag = item.BackdropImageTags?.[0];

    if (backdropTag) {
        return safeImageUrl(
            apiClient,
            item.Id,
            {
                type: 'Backdrop',
                tag: backdropTag,
                index: 0,
                maxWidth: 1920,
                quality: 92
            },
            getMinitigerImageRevision(item)
        );
    }

    const primaryTag = item.ImageTags?.Primary;

    if (primaryTag) {
        return safeImageUrl(
            apiClient,
            item.Id,
            {
                type: 'Primary',
                tag: primaryTag,
                maxWidth: 1600,
                quality: 90
            },
            getMinitigerImageRevision(item)
        );
    }

    return undefined;
};

export const getLogoImageUrl = (
    apiClient: ApiClient | undefined,
    item: ItemDto
) => {
    const logoTag = item.ImageTags?.Logo;

    if (!logoTag) {
        return undefined;
    }

    return safeImageUrl(
        apiClient,
        item.Id,
        {
            type: 'Logo',
            tag: logoTag,
            maxWidth: 800,
            quality: 92
        },
        getMinitigerImageRevision(item)
    );
};

export const getMediaTypeName = (type?: string | null) => {
    switch (String(type ?? '').toLowerCase()) {
        case 'movie':
            return 'Film';
        case 'series':
            return 'Serie';
        case 'season':
            return 'Staffel';
        case 'episode':
            return 'Episode';
        case 'audio':
            return 'Musik';
        case 'musicalbum':
            return 'Album';
        case 'musicartist':
            return 'Künstler';
        case 'musicvideo':
            return 'Musikvideo';
        case 'book':
            return 'Manga';
        case 'folder':
            return 'Manga';
        case 'video':
            return 'Video';
        default:
            return type ?? 'Medium';
    }
};

export const getEpisodeLabel = (item: ItemDto) => {
    if (item.Type !== 'Episode') {
        return '';
    }

    const season = item.ParentIndexNumber;
    const episode = item.IndexNumber;

    if (season != null && episode != null) {
        return `S${season} · E${episode}`;
    }

    if (episode != null) {
        return `Episode ${episode}`;
    }

    return 'Episode';
};

export const getCardTitle = (item: ItemDto) => {
    if (
        (
            item.Type === 'Episode'
            || item.Type === 'Season'
        )
        && item.SeriesName
    ) {
        return item.SeriesName;
    }

    return item.Name ?? 'Unbekannt';
};

export const getCardSubtitle = (item: ItemDto) => {
    if (item.Type === 'Episode') {
        const episodeLabel = getEpisodeLabel(item);
        const episodeName = item.Name ?? '';

        return [ episodeLabel, episodeName ]
            .filter(Boolean)
            .join(' · ');
    }

    if (item.Type === 'Season') {
        return [
            item.Name ?? 'Staffel',
            item.ProductionYear
        ]
            .filter(Boolean)
            .join(' · ');
    }

    return [
        getMediaTypeName(item.Type),
        item.ProductionYear
    ]
        .filter(Boolean)
        .join(' · ');
};

export const getPlaybackProgress = (item: ItemDto) => {
    const position = item.UserData?.PlaybackPositionTicks ?? 0;
    const runtime = item.RunTimeTicks ?? 0;

    if (!position || !runtime || runtime <= 0) {
        return 0;
    }

    return Math.max(0, Math.min(100, (position / runtime) * 100));
};

export const shortOverview = (overview?: string | null, limit = 330) => {
    const value = String(overview ?? '').trim();

    if (value.length <= limit) {
        return value;
    }

    return `${value.slice(0, limit).trimEnd()}…`;
};

const LANGUAGE_NAMES: Record<string, string> = {
    de: 'Deutsch',
    deu: 'Deutsch',
    ger: 'Deutsch',
    german: 'Deutsch',
    deutsch: 'Deutsch',

    en: 'Englisch',
    eng: 'Englisch',
    english: 'Englisch',
    englisch: 'Englisch',

    ja: 'Japanisch',
    jpn: 'Japanisch',
    japanese: 'Japanisch',
    japanisch: 'Japanisch',

    ko: 'Koreanisch',
    kor: 'Koreanisch',
    korean: 'Koreanisch',
    koreanisch: 'Koreanisch',

    zh: 'Chinesisch',
    zho: 'Chinesisch',
    chi: 'Chinesisch',
    chinese: 'Chinesisch',
    chinesisch: 'Chinesisch',

    fr: 'Französisch',
    fra: 'Französisch',
    fre: 'Französisch',
    french: 'Französisch',
    französisch: 'Französisch',

    es: 'Spanisch',
    spa: 'Spanisch',
    spanish: 'Spanisch',
    spanisch: 'Spanisch',

    it: 'Italienisch',
    ita: 'Italienisch',
    italian: 'Italienisch',
    italienisch: 'Italienisch',

    pt: 'Portugiesisch',
    por: 'Portugiesisch',
    portuguese: 'Portugiesisch',
    portugiesisch: 'Portugiesisch',

    ru: 'Russisch',
    rus: 'Russisch',
    russian: 'Russisch',
    russisch: 'Russisch',

    pl: 'Polnisch',
    pol: 'Polnisch',
    polish: 'Polnisch',
    polnisch: 'Polnisch',

    nl: 'Niederländisch',
    nld: 'Niederländisch',
    dut: 'Niederländisch',
    dutch: 'Niederländisch',
    niederländisch: 'Niederländisch',

    cs: 'Tschechisch',
    ces: 'Tschechisch',
    cze: 'Tschechisch',
    czech: 'Tschechisch',
    tschechisch: 'Tschechisch',

    sv: 'Schwedisch',
    swe: 'Schwedisch',
    swedish: 'Schwedisch',
    schwedisch: 'Schwedisch',

    no: 'Norwegisch',
    nor: 'Norwegisch',
    norwegian: 'Norwegisch',
    norwegisch: 'Norwegisch',

    da: 'Dänisch',
    dan: 'Dänisch',
    danish: 'Dänisch',
    dänisch: 'Dänisch',

    fi: 'Finnisch',
    fin: 'Finnisch',
    finnish: 'Finnisch',
    finnisch: 'Finnisch',

    tr: 'Türkisch',
    tur: 'Türkisch',
    turkish: 'Türkisch',
    türkisch: 'Türkisch',

    uk: 'Ukrainisch',
    ukr: 'Ukrainisch',
    ukrainian: 'Ukrainisch',
    ukrainisch: 'Ukrainisch'
};

const LANGUAGE_FLAGS: Record<string, string> = {
    Deutsch: 'de',
    Englisch: 'gb',
    Japanisch: 'jp',
    Koreanisch: 'kr',
    Chinesisch: 'cn',
    Französisch: 'fr',
    Spanisch: 'es',
    Italienisch: 'it',
    Portugiesisch: 'pt',
    Russisch: 'ru',
    Polnisch: 'pl',
    Niederländisch: 'nl',
    Tschechisch: 'cz',
    Schwedisch: 'se',
    Norwegisch: 'no',
    Dänisch: 'dk',
    Finnisch: 'fi',
    Türkisch: 'tr',
    Ukrainisch: 'ua'
};

const normalizeLanguage = (value?: string | null) => {
    const raw = String(value ?? '').trim();

    if (!raw) {
        return null;
    }

    const direct = raw.toLowerCase();

    if (
        direct === 'und'
        || direct === 'unknown'
        || direct === 'undefined'
    ) {
        return null;
    }

    if (LANGUAGE_NAMES[direct]) {
        return LANGUAGE_NAMES[direct];
    }

    /*
     * Jellyfin/ffprobe metadata is not always consistent:
     * sometimes Language is empty but Title contains strings such as
     * "German - AAC - Stereo - Standard".
     */
    const normalizedText = direct
        .replace(/[_/()[\],;:+-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    for (const [ alias, name ] of Object.entries(LANGUAGE_NAMES)) {
        if (
            alias.length >= 2
            && new RegExp(
                `(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s)`,
                'i'
            ).test(normalizedText)
        ) {
            return name;
        }
    }

    return null;
};

export const getLanguageFlag = (
    language?: string | null
) => {
    if (!language) {
        return null;
    }

    const canonical =
        LANGUAGE_NAMES[language.toLowerCase()]
        ?? language;

    return LANGUAGE_FLAGS[canonical] ?? 'generic';
};

export const getLanguageFlagUrl = (
    language?: string | null
) => {
    const flag = getLanguageFlag(language);

    if (!flag) {
        return null;
    }

    return getEmbeddedFlagUrl(flag);
};

export const supportsAudioFlags = (
    item: ItemDto
) => {
    const type =
        String(item.Type ?? '').toLowerCase();

    return [
        'movie',
        'series',
        'season',
        'episode',
        'video'
    ].includes(type);
};

export const supportsFskBadge = (
    item: ItemDto
) => {
    const type =
        String(item.Type ?? '').toLowerCase();

    return [
        'movie',
        'series',
        'season',
        'episode',
        'video'
    ].includes(type);
};

export const getStreamLanguages = (
    item: ItemDto,
    type: 'Audio' | 'Subtitle'
) => {
    const mediaSources = (
        item.MediaSources
        ?? []
    ) as Array<{
        MediaStreams?: ItemDto['MediaStreams'];
    }>;

    const allStreams = [
        ...(item.MediaStreams ?? []),
        ...mediaSources.flatMap(
            source => source.MediaStreams ?? []
        )
    ];

    const values = allStreams
        .filter(stream =>
            String(stream.Type ?? '').toLowerCase()
            === type.toLowerCase()
        )
        .map(stream => (
            normalizeLanguage(stream.Language)
            ?? normalizeLanguage(stream.LocalizedLanguage)
            ?? normalizeLanguage(stream.Title)
        ))
        .filter(
            (value): value is string =>
                Boolean(value)
        );

    return Array.from(new Set(values));
};

export const getRatingLabel = (rating?: string | null) => {
    const value = String(rating ?? '').trim();

    if (!value) {
        return null;
    }

    const upper = value.toUpperCase();

    const fskMatch = upper.match(
        /(?:FSK[\s-]*)?(0|6|12|16|18)$/
    );

    if (fskMatch) {
        return `FSK ${fskMatch[1]}`;
    }

    const mapped: Record<string, string> = {
        'G': 'FSK 0',
        'TV-Y': 'FSK 0',
        'TV-G': 'FSK 0',
        'TV-Y7': 'FSK 6',
        'TV-Y7-FV': 'FSK 6',
        'PG': 'FSK 6',
        'TV-PG': 'FSK 6',
        'PG-13': 'FSK 12',
        'TV-14': 'FSK 12',
        'R': 'FSK 16',
        'TV-MA': 'FSK 16',
        'NC-17': 'FSK 18'
    };

    return mapped[upper] ?? value;
};

export const getRuntimeLabel = (ticks?: number | null) => {
    if (!ticks || ticks <= 0) {
        return null;
    }

    const totalMinutes = Math.round(ticks / 600_000_000);

    if (totalMinutes < 60) {
        return `${totalMinutes} Min.`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return minutes
        ? `${hours} Std. ${minutes} Min.`
        : `${hours} Std.`;
};


export const getEndTimeLabel = (
    runTimeTicks?: number | null,
    playbackPositionTicks = 0
) => {
    if (!runTimeTicks || runTimeTicks <= 0) {
        return null;
    }

    const remainingTicks = Math.max(
        0,
        runTimeTicks - Math.max(0, playbackPositionTicks)
    );

    const end = new Date(
        Date.now() + remainingTicks / 10_000
    );

    return `Endet um ${end.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
    })} Uhr`;
};

export const getBingeEndLabel = (
    remainingTicks?: number | null
) => {
    if (!remainingTicks || remainingTicks <= 0) {
        return null;
    }

    const end = new Date(
        Date.now() + remainingTicks / 10_000
    );

    return `Binge bis ${end.toLocaleDateString('de-DE')} · ${end.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
    })} Uhr`;
};

// MINITIGER_PATCH_MARKER: PHASE_18_18_0_MAIN_TITLE_HELPERS
