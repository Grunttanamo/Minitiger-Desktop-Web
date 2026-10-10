import type { ApiClient } from 'jellyfin-apiclient';
import {
    useEffect,
    useState
} from 'react';

import { getMinitigerAccessToken } from './apiAuth';

export interface MinitigerLanguageFlagOption {
    code: string;
    name: string;
}

export const MINITIGER_LANGUAGE_FLAG_OPTIONS:
    MinitigerLanguageFlagOption[] = [
        { code: 'de', name: 'Deutsch' },
        { code: 'en', name: 'Englisch' },
        { code: 'ja', name: 'Japanisch' },
        { code: 'ko', name: 'Koreanisch' },
        { code: 'zh', name: 'Chinesisch' },
        { code: 'fr', name: 'Französisch' },
        { code: 'es', name: 'Spanisch' },
        { code: 'it', name: 'Italienisch' },
        { code: 'pt', name: 'Portugiesisch' },
        { code: 'ru', name: 'Russisch' },
        { code: 'pl', name: 'Polnisch' },
        { code: 'nl', name: 'Niederländisch' },
        { code: 'cs', name: 'Tschechisch' },
        { code: 'sv', name: 'Schwedisch' },
        { code: 'no', name: 'Norwegisch' },
        { code: 'da', name: 'Dänisch' },
        { code: 'fi', name: 'Finnisch' },
        { code: 'tr', name: 'Türkisch' },
        { code: 'uk', name: 'Ukrainisch' }
    ];

type OverrideMap =
    Map<string, string[]>;

let cacheKey = '';
let cacheLoaded = false;
let cache =
    new Map<string, string[]>();
let loadingPromise:
    Promise<OverrideMap>
    | null = null;

const listeners =
    new Set<() => void>();

const emit = () => {
    listeners.forEach(listener =>
        listener()
    );
};

const normalizeItemId = (
    value?: string | null
) => String(value ?? '')
    .replace(/-/g, '')
    .trim()
    .toLowerCase();

const getServerKey = (
    apiClient: ApiClient
) => [
    apiClient.serverId?.()
    ?? '',
    apiClient.serverAddress?.()
    ?? ''
].join('|');

const authenticatedUrl = (
    apiClient: ApiClient,
    path: string
) => {
    const token =
        getMinitigerAccessToken(
            apiClient
        );

    return apiClient.getUrl(
        path,
        token
            ? { ApiKey: token }
            : {}
    );
};

const normalizeLanguages = (
    raw: unknown
) => Array.isArray(raw)
    ? raw
        .map(value =>
            String(value ?? '').trim()
        )
        .filter(Boolean)
    : [];

const normalizeResponse = (
    raw: unknown
) => {
    const next =
        new Map<string, string[]>();

    if (
        !raw
        || typeof raw !== 'object'
    ) {
        return next;
    }

    const root =
        raw as Record<string, unknown>;

    const items =
        root.items
        ?? root.Items;

    if (
        !items
        || typeof items !== 'object'
        || Array.isArray(items)
    ) {
        return next;
    }

    Object.entries(
        items as Record<
            string,
            unknown
        >
    ).forEach(
        ([ itemId, languages ]) => {
            const normalizedId =
                normalizeItemId(
                    itemId
                );

            if (!normalizedId) {
                return;
            }

            next.set(
                normalizedId,
                normalizeLanguages(
                    languages
                )
            );
        }
    );

    return next;
};

const requestJson = async (
    apiClient: ApiClient,
    path: string,
    init?: RequestInit
) => {
    const response = await fetch(
        authenticatedUrl(
            apiClient,
            path
        ),
        init
    );

    if (response.status === 404) {
        throw new Error(
            'Das Minitiger Companion Plugin unterstützt manuelle Sprachflaggen noch nicht.'
        );
    }

    if (!response.ok) {
        const details =
            await response.text()
                .catch(() => '');

        throw new Error(
            `Minitiger Sprachflaggen HTTP ${response.status}${
                details
                    ? ` · ${details}`
                    : ''
            }`
        );
    }

    if (response.status === 204) {
        return undefined;
    }

    return await response.json();
};

export const loadMinitigerLanguageFlagOverrides =
    async (
        apiClient: ApiClient,
        force = false
    ) => {
        const serverKey =
            getServerKey(
                apiClient
            );

        if (
            cacheKey !== serverKey
        ) {
            cacheKey = serverKey;
            cacheLoaded = false;
            cache =
                new Map<
                    string,
                    string[]
                >();
            loadingPromise = null;
        }

        if (
            cacheLoaded
            && !force
        ) {
            return cache;
        }

        if (
            loadingPromise
            && !force
        ) {
            return await loadingPromise;
        }

        loadingPromise = (
            async () => {
                try {
                    const raw =
                        await requestJson(
                            apiClient,
                            'Minitiger/LanguageFlags'
                        );

                    cache =
                        normalizeResponse(
                            raw
                        );

                    cacheLoaded = true;
                    emit();

                    return cache;
                } catch (error) {
                    console.warn(
                        '[Minitiger LanguageFlags] Overrides konnten nicht geladen werden',
                        error
                    );

                    cacheLoaded = true;
                    emit();

                    return cache;
                } finally {
                    loadingPromise = null;
                }
            }
        )();

        return await loadingPromise;
    };

export const getCachedMinitigerLanguageFlags =
    (
        itemId?: string | null
    ): string[] | undefined => {
        const normalizedId =
            normalizeItemId(
                itemId
            );

        if (
            !normalizedId
            || !cache.has(
                normalizedId
            )
        ) {
            return undefined;
        }

        return [
            ...(
                cache.get(
                    normalizedId
                )
                ?? []
            )
        ];
    };

export const useMinitigerLanguageFlagRevision =
    (
        apiClient?: ApiClient
    ) => {
        const [
            revision,
            setRevision
        ] = useState(0);

        useEffect(() => {
            const update = () => {
                setRevision(
                    current =>
                        current + 1
                );
            };

            listeners.add(
                update
            );

            if (apiClient) {
                void loadMinitigerLanguageFlagOverrides(
                    apiClient
                );
            }

            return () => {
                listeners.delete(
                    update
                );
            };
        }, [ apiClient ]);

        return revision;
    };

export const useMinitigerLanguageFlags =
    (
        apiClient?: ApiClient,
        itemId?: string | null
    ) => {
        const [
            value,
            setValue
        ] = useState<
            string[]
            | undefined
        >(
            () =>
                getCachedMinitigerLanguageFlags(
                    itemId
                )
        );

        useEffect(() => {
            const update = () => {
                setValue(
                    getCachedMinitigerLanguageFlags(
                        itemId
                    )
                );
            };

            listeners.add(
                update
            );

            update();

            if (apiClient) {
                void loadMinitigerLanguageFlagOverrides(
                    apiClient
                );
            }

            return () => {
                listeners.delete(
                    update
                );
            };
        }, [
            apiClient,
            itemId
        ]);

        return value;
    };

export const saveMinitigerLanguageFlags =
    async (
        apiClient: ApiClient,
        itemId: string,
        languages: string[]
    ) => {
        await requestJson(
            apiClient,
            `Minitiger/LanguageFlags/${
                encodeURIComponent(
                    itemId
                )
            }`,
            {
                method: 'PUT',
                headers: {
                    'Content-Type':
                        'application/json'
                },
                body: JSON.stringify({
                    languages
                })
            }
        );

        const normalizedId =
            normalizeItemId(
                itemId
            );

        cache.set(
            normalizedId,
            [ ...languages ]
        );
        cacheLoaded = true;
        emit();
    };

export const saveMinitigerLanguageFlagsBulk =
    async (
        apiClient: ApiClient,
        itemIds: string[],
        languages: string[]
    ) => {
        const uniqueIds =
            Array.from(
                new Set(
                    itemIds
                        .map(itemId =>
                            String(itemId ?? '').trim()
                        )
                        .filter(Boolean)
                )
            );

        if (!uniqueIds.length) {
            return;
        }

        /*
         * Use the same per-item PUT route that is already proven to work for
         * normal manual flag edits. The dedicated Bulk route can be rejected
         * with HTTP 403 by Jellyfin's elevated-route authorization even when
         * the current admin is allowed to edit each item individually.
         *
         * Keep a small concurrency window so even long series do not hammer
         * the server with hundreds of simultaneous requests.
         */
        const concurrency = Math.min(
            6,
            uniqueIds.length
        );
        let nextIndex = 0;

        const succeeded: string[] = [];
        const failed: string[] = [];

        const worker = async () => {
            while (true) {
                const index = nextIndex;
                nextIndex += 1;

                if (index >= uniqueIds.length) {
                    return;
                }

                const itemId =
                    uniqueIds[index];

                try {
                    await requestJson(
                        apiClient,
                        `Minitiger/LanguageFlags/${
                            encodeURIComponent(
                                itemId
                            )
                        }`,
                        {
                            method: 'PUT',
                            headers: {
                                'Content-Type':
                                    'application/json'
                            },
                            body: JSON.stringify({
                                languages
                            })
                        }
                    );

                    succeeded.push(
                        itemId
                    );
                } catch (error) {
                    console.warn(
                        '[Minitiger LanguageFlags] Unterelement konnte nicht aktualisiert werden',
                        itemId,
                        error
                    );

                    failed.push(
                        itemId
                    );
                }
            }
        };

        await Promise.all(
            Array.from(
                { length: concurrency },
                () => worker()
            )
        );

        succeeded.forEach(
            itemId => {
                cache.set(
                    normalizeItemId(
                        itemId
                    ),
                    [ ...languages ]
                );
            }
        );

        cacheLoaded = true;
        emit();

        if (failed.length > 0) {
            throw new Error(
                `${failed.length} von ${uniqueIds.length} Inhalten konnten nicht aktualisiert werden.`
            );
        }
    };

export const clearMinitigerLanguageFlags =
    async (
        apiClient: ApiClient,
        itemId: string
    ) => {
        await requestJson(
            apiClient,
            `Minitiger/LanguageFlags/${
                encodeURIComponent(
                    itemId
                )
            }`,
            {
                method: 'DELETE'
            }
        );

        cache.delete(
            normalizeItemId(
                itemId
            )
        );
        cacheLoaded = true;
        emit();
    };

export const refreshMinitigerLanguageFlagOverrides =
    async (
        apiClient: ApiClient
    ) => await loadMinitigerLanguageFlagOverrides(
        apiClient,
        true
    );
