import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useApi } from 'hooks/useApi';

import {
    DEFAULT_LIBRARY_SETTINGS,
    type MinitigerLibrarySettings,
    normalizeLibrarySettings
} from '../config/librarySettings';

const STORAGE_PREFIX = 'Minitiger.LibrarySettings.v1';
const SYNC_EVENT = 'minitiger:library-settings-changed';

const readSettings = (storageKey: string) => {
    try {
        const raw = window.localStorage.getItem(storageKey);

        if (!raw) {
            return DEFAULT_LIBRARY_SETTINGS;
        }

        return normalizeLibrarySettings(JSON.parse(raw));
    } catch (error) {
        console.warn(
            '[Minitiger Library Settings] Einstellungen konnten nicht gelesen werden',
            error
        );

        return DEFAULT_LIBRARY_SETTINGS;
    }
};

const useMinitigerLibrarySettings = () => {
    const {
        user,
        __legacyApiClient__: apiClient
    } = useApi();

    const storageKey = useMemo(() => [
        STORAGE_PREFIX,
        apiClient?.serverId() ?? 'server',
        user?.Id ?? 'user'
    ].join(':'), [apiClient, user?.Id]);

    const activeStorageKey = useRef(storageKey);
    const [ settings, setSettings ] = useState<MinitigerLibrarySettings>(
        () => readSettings(storageKey)
    );

    useEffect(() => {
        console.info('[Minitiger Desktop Compat] library settings', {
            origin: window.location.origin,
            storageKey,
            settings
        });
    }, [ storageKey ]);

    useEffect(() => {
        if (activeStorageKey.current === storageKey) {
            return;
        }

        activeStorageKey.current = storageKey;
        setSettings(readSettings(storageKey));
    }, [storageKey]);

    useEffect(() => {
        const onSync = (event: Event) => {
            const custom = event as CustomEvent<MinitigerLibrarySettings>;

            if (!custom.detail) {
                return;
            }

            setSettings(
                normalizeLibrarySettings(custom.detail)
            );
        };

        window.addEventListener(SYNC_EVENT, onSync);

        return () => {
            window.removeEventListener(SYNC_EVENT, onSync);
        };
    }, []);

    const persist = useCallback((next: MinitigerLibrarySettings) => {
        const normalized = normalizeLibrarySettings(next);
        setSettings(normalized);

        try {
            window.localStorage.setItem(
                activeStorageKey.current,
                JSON.stringify(normalized)
            );
        } catch (error) {
            console.warn(
                '[Minitiger Library Settings] Einstellungen konnten nicht gespeichert werden',
                error
            );
        }

        window.dispatchEvent(
            new CustomEvent<MinitigerLibrarySettings>(
                SYNC_EVENT,
                { detail: normalized }
            )
        );
    }, []);

    const updateSettings = useCallback((
        patch: Partial<MinitigerLibrarySettings>
    ) => {
        setSettings(current => {
            const next = normalizeLibrarySettings({
                ...current,
                ...patch
            });

            try {
                window.localStorage.setItem(
                    activeStorageKey.current,
                    JSON.stringify(next)
                );
            } catch (error) {
                console.warn(
                    '[Minitiger Library Settings] Einstellungen konnten nicht gespeichert werden',
                    error
                );
            }

            window.dispatchEvent(
                new CustomEvent<MinitigerLibrarySettings>(
                    SYNC_EVENT,
                    { detail: next }
                )
            );

            return next;
        });
    }, []);

    const resetSettings = useCallback(() => {
        persist(DEFAULT_LIBRARY_SETTINGS);
    }, [persist]);

    return {
        settings,
        updateSettings,
        resetSettings,
        replaceSettings: persist
    };
};

export default useMinitigerLibrarySettings;
