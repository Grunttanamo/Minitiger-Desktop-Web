import type { ApiClient } from 'jellyfin-apiclient';

import type { ItemDto } from 'types/base/models/item-dto';

const CACHE_VERSION = 1;
const CACHE_TTL_MS =
    24 * 60 * 60 * 1000;
const CACHE_PREFIX =
    'Minitiger.HomeItems.v1';
const CACHE_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCacheCleanupAt = 0;

interface PersistedItemCache {
    version: 1;
    savedAt: number;
    items: ItemDto[];
}

const isMinitigerDesktopShell = () => {
    if (typeof window === 'undefined') {
        return false;
    }

    const nativeWindow =
        window as Window & {
            NativeShell?: unknown;
            jmpInfo?: {
                bundledMinitigerWeb?: boolean;
            };
        };

    return Boolean(
        nativeWindow.NativeShell
        || nativeWindow.jmpInfo
            ?.bundledMinitigerWeb
    );
};

const getCacheBase = (
    apiClient: ApiClient | undefined,
    userId: string,
    scope: string
) => [
    CACHE_PREFIX,
    apiClient?.serverId?.()
        ?? 'server',
    userId || 'user',
    scope
].join(':');

const getCacheKey = (
    apiClient: ApiClient | undefined,
    userId: string,
    scope: string,
    fingerprint = ''
) => [
    getCacheBase(
        apiClient,
        userId,
        scope
    ),
    fingerprint || 'default'
].join(':');

// Remove stale HomeItems snapshots without touching user settings or custom rows.
const pruneExpiredHomeItemCaches = () => {
    const now = Date.now();

    if (now - lastCacheCleanupAt < CACHE_CLEANUP_INTERVAL_MS) {
        return;
    }

    lastCacheCleanupAt = now;

    for (let index = window.localStorage.length - 1; index >= 0; index--) {
        const key = window.localStorage.key(index);

        if (!key?.startsWith(`${CACHE_PREFIX}:`)) {
            continue;
        }

        try {
            const raw = window.localStorage.getItem(key);

            if (!raw) {
                continue;
            }

            const cached = JSON.parse(raw) as Partial<PersistedItemCache>;

            if (
                cached.version !== CACHE_VERSION
                || !Array.isArray(cached.items)
                || typeof cached.savedAt !== 'number'
                || cached.savedAt > now
                || now - cached.savedAt > CACHE_TTL_MS
            ) {
                window.localStorage.removeItem(key);
            }
        } catch {
            window.localStorage.removeItem(key);
        }
    }
};

export const readMinitigerItemCache = (
    apiClient: ApiClient | undefined,
    userId: string,
    scope: string,
    fingerprint = ''
): ItemDto[] => {
    if (
        !isMinitigerDesktopShell()
        || !userId
    ) {
        return [];
    }

    const key =
        getCacheKey(
            apiClient,
            userId,
            scope,
            fingerprint
        );

    try {
        const raw =
            window.localStorage.getItem(
                key
            );

        if (!raw) {
            return [];
        }

        const parsed =
            JSON.parse(raw) as Partial<PersistedItemCache>;

        if (
            parsed.version
                !== CACHE_VERSION
            || !Array.isArray(
                parsed.items
            )
            || typeof parsed.savedAt
                !== 'number'
            || Date.now()
                - parsed.savedAt
                > CACHE_TTL_MS
        ) {
            window.localStorage.removeItem(
                key
            );
            return [];
        }

        return parsed.items;
    } catch {
        return [];
    }
};

export const writeMinitigerItemCache = (
    apiClient: ApiClient | undefined,
    userId: string,
    scope: string,
    items: ItemDto[],
    fingerprint = ''
) => {
    if (
        !isMinitigerDesktopShell()
        || !userId
    ) {
        return;
    }

    const base =
        getCacheBase(
            apiClient,
            userId,
            scope
        );
    const key =
        getCacheKey(
            apiClient,
            userId,
            scope,
            fingerprint
        );

    try {
        pruneExpiredHomeItemCaches();

        // A fingerprint change means the configured contents changed. Keep
        // one current snapshot per scope instead of accumulating old virtual
        // library membership snapshots forever.
        for (
            let index =
                window.localStorage.length - 1;
            index >= 0;
            index -= 1
        ) {
            const candidate =
                window.localStorage.key(
                    index
                );

            if (
                candidate
                && candidate !== key
                && candidate.startsWith(
                    `${base}:`
                )
            ) {
                window.localStorage.removeItem(
                    candidate
                );
            }
        }

        const value: PersistedItemCache = {
            version: 1,
            savedAt: Date.now(),
            items
        };

        window.localStorage.setItem(
            key,
            JSON.stringify(value)
        );
    } catch (error) {
        console.warn(
            '[Minitiger Home] Persistenter Inhalts-Cache konnte nicht gespeichert werden.',
            error
        );
    }
};
