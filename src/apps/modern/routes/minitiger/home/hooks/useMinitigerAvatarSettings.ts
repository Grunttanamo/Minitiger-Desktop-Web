import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';

import { useApi } from 'hooks/useApi';

import {
    DEFAULT_MINITIGER_AVATAR_SETTINGS,
    type MinitigerAvatarSettings,
    normalizeMinitigerAvatarSettings,
    parseMinitigerGalleryAvatarReference
} from '../config/avatarSettings';
import {
    readMinitigerServerPreference,
    writeMinitigerServerPreference
} from '../serverPreferences';
import {
    getMinitigerVirtualServerMediaUrl
} from '../virtualServerSync';

const STORAGE_PREFIX = 'Minitiger.CustomAvatar.v1';
const SERVER_PREF_KEY = 'avatarSettings';
const SYNC_EVENT = 'minitiger:avatar-settings-changed';
const LOGIN_USERS_VERSION = 1;

interface AvatarSyncDetail {
    userId: string;
    settings: MinitigerAvatarSettings;
}

const cloneDefaults = (): MinitigerAvatarSettings => ({
    ...DEFAULT_MINITIGER_AVATAR_SETTINGS
});

const readLocal = (storageKey: string) => {
    try {
        const raw = window.localStorage.getItem(storageKey);

        if (!raw) {
            return cloneDefaults();
        }

        return normalizeMinitigerAvatarSettings(
            JSON.parse(raw)
        );
    } catch (error) {
        console.warn(
            '[Minitiger Avatar] Lokale Einstellungen konnten nicht gelesen werden.',
            error
        );
        return cloneDefaults();
    }
};

const getRememberedLoginUsersKey = (
    apiClient: {
        serverId?: () => string;
        deviceId?: () => string;
    }
) => {
    let serverId = 'server';
    let deviceId = 'device';

    try {
        serverId = apiClient.serverId?.() || serverId;
    } catch {
        // Fallback is enough for a cosmetic cache.
    }

    try {
        deviceId = apiClient.deviceId?.() || deviceId;
    } catch {
        // Fallback is enough for a cosmetic cache.
    }

    return `minitiger.login.users.v${LOGIN_USERS_VERSION}:${serverId}:${deviceId}`;
};

const blobToDataUrl = (
    blob: Blob
) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () =>
        reject(
            reader.error
            ?? new Error(
                'Avatar konnte nicht als Data-URL gelesen werden.'
            )
        );

    reader.onload = () =>
        resolve(
            typeof reader.result === 'string'
                ? reader.result
                : ''
        );

    reader.readAsDataURL(blob);
});

const resolveRememberedLoginAvatar = async (
    apiClient: Parameters<
        typeof getMinitigerVirtualServerMediaUrl
    >[0],
    settings: MinitigerAvatarSettings
) => {
    if (settings.image.startsWith('data:image/')) {
        return settings.image;
    }

    const galleryReference =
        parseMinitigerGalleryAvatarReference(
            settings.image
        );

    if (!galleryReference || !apiClient) {
        return null;
    }

    const url =
        getMinitigerVirtualServerMediaUrl(
            apiClient,
            galleryReference.id,
            'image',
            galleryReference.revision
        );

    if (!url) {
        return null;
    }

    const response =
        await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Avatar-Abruf fehlgeschlagen: HTTP ${response.status}`
        );
    }

    const dataUrl =
        await blobToDataUrl(
            await response.blob()
        );

    return dataUrl.startsWith('data:image/')
        ? dataUrl
        : null;
};

const syncRememberedLoginAvatar = async (
    apiClient: {
        serverId?: () => string;
        deviceId?: () => string;
    } & Parameters<
        typeof getMinitigerVirtualServerMediaUrl
    >[0],
    userId: string,
    settings: MinitigerAvatarSettings
) => {
    try {
        const key = getRememberedLoginUsersKey(apiClient);
        const parsed = JSON.parse(
            window.localStorage.getItem(key) || '[]'
        ) as Array<Record<string, unknown>>;

        if (!Array.isArray(parsed)) {
            return;
        }

        const avatar =
            await resolveRememberedLoginAvatar(
                apiClient,
                settings
            );

        let changed = false;
        const next = parsed.map(entry => {
            if (entry?.Id !== userId) {
                return entry;
            }

            changed = true;

            return {
                ...entry,
                MinitigerAvatar: avatar
            };
        });

        if (changed) {
            window.localStorage.setItem(
                key,
                JSON.stringify(next)
            );
        }
    } catch (error) {
        console.warn(
            '[Minitiger Avatar] Login-Avatar konnte nicht synchronisiert werden.',
            error
        );
    }
};

const useMinitigerAvatarSettings = () => {
    const {
        user,
        __legacyApiClient__: apiClient
    } = useApi();

    const userId = user?.Id ?? '';

    const storageKey = useMemo(() => [
        STORAGE_PREFIX,
        apiClient?.serverId() ?? 'server',
        userId || 'user'
    ].join(':'), [ apiClient, userId ]);

    const activeStorageKey = useRef(storageKey);
    const [ settings, setSettingsState ] =
        useState<MinitigerAvatarSettings>(
            () => readLocal(storageKey)
        );
    const settingsRef = useRef(settings);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    useEffect(() => {
        if (activeStorageKey.current === storageKey) {
            return;
        }

        activeStorageKey.current = storageKey;
        setSettingsState(readLocal(storageKey));
    }, [storageKey]);

    useEffect(() => {
        const onSync = (event: Event) => {
            const custom =
                event as CustomEvent<AvatarSyncDetail>;

            if (
                !custom.detail
                || custom.detail.userId !== userId
            ) {
                return;
            }

            setSettingsState(
                normalizeMinitigerAvatarSettings(
                    custom.detail.settings
                )
            );
        };

        window.addEventListener(SYNC_EVENT, onSync);

        return () => {
            window.removeEventListener(
                SYNC_EVENT,
                onSync
            );
        };
    }, [userId]);

    useEffect(() => {
        if (!apiClient || !userId) {
            return;
        }

        let cancelled = false;

        void readMinitigerServerPreference<MinitigerAvatarSettings>(
            apiClient,
            userId,
            SERVER_PREF_KEY
        ).then(serverValue => {
            if (cancelled || !serverValue) {
                return;
            }

            const normalized =
                normalizeMinitigerAvatarSettings(
                    serverValue
                );

            setSettingsState(normalized);

            try {
                window.localStorage.setItem(
                    activeStorageKey.current,
                    JSON.stringify(normalized)
                );
            } catch {
                // Server value remains available in memory.
            }

            void syncRememberedLoginAvatar(
                apiClient,
                userId,
                normalized
            );
        });

        return () => {
            cancelled = true;
        };
    }, [ apiClient, userId ]);

    const persist = useCallback(async (
        nextValue: MinitigerAvatarSettings
    ) => {
        const normalized =
            normalizeMinitigerAvatarSettings(
                nextValue
            );

        settingsRef.current = normalized;
        setSettingsState(normalized);

        try {
            window.localStorage.setItem(
                activeStorageKey.current,
                JSON.stringify(normalized)
            );
        } catch (error) {
            console.warn(
                '[Minitiger Avatar] Lokales Speichern fehlgeschlagen.',
                error
            );
        }

        if (userId) {
            window.dispatchEvent(
                new CustomEvent<AvatarSyncDetail>(
                    SYNC_EVENT,
                    {
                        detail: {
                            userId,
                            settings: normalized
                        }
                    }
                )
            );
        }

        if (apiClient && userId) {
            await syncRememberedLoginAvatar(
                apiClient,
                userId,
                normalized
            );

            await writeMinitigerServerPreference(
                apiClient,
                userId,
                SERVER_PREF_KEY,
                normalized
            );
        }

        return normalized;
    }, [ apiClient, userId ]);

    const updateSettings = useCallback((
        patch: Partial<MinitigerAvatarSettings>
    ) => {
        const next =
            normalizeMinitigerAvatarSettings({
                ...settingsRef.current,
                ...patch
            });

        void persist(next).catch(error => {
            console.warn(
                '[Minitiger Avatar] Server-Sync fehlgeschlagen.',
                error
            );
        });

        return next;
    }, [persist]);

    const updateSettingsAsync = useCallback((
        patch: Partial<MinitigerAvatarSettings>
    ) => {
        const next =
            normalizeMinitigerAvatarSettings({
                ...settingsRef.current,
                ...patch
            });

        return persist(next);
    }, [persist]);

    const resetSettings = useCallback(() => {
        void persist(cloneDefaults()).catch(error => {
            console.warn(
                '[Minitiger Avatar] Reset-Sync fehlgeschlagen.',
                error
            );
        });
    }, [persist]);

    const resolvedImage = useMemo(() => {
        const galleryReference =
            parseMinitigerGalleryAvatarReference(
                settings.image
            );

        if (galleryReference) {
            return getMinitigerVirtualServerMediaUrl(
                apiClient,
                galleryReference.id,
                'image',
                galleryReference.revision
            );
        }

        return settings.image;
    }, [
        apiClient,
        settings.image
    ]);

    return {
        settings,
        resolvedImage,
        updateSettings,
        updateSettingsAsync,
        resetSettings
    };
};

export default useMinitigerAvatarSettings;
