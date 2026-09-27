import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';

import { useApi } from 'hooks/useApi';

import {
    DEFAULT_LIBRARY_SETTINGS,
    type MinitigerLibrarySettings,
    normalizeLibrarySettings
} from '../config/librarySettings';
import {
    addMinitigerServerPreferenceOverrides,
    broadcastMinitigerServerPreference,
    readMinitigerServerPreference,
    writeMinitigerServerPreference
} from '../serverPreferences';

const STORAGE_PREFIX = 'Minitiger.LibrarySettings.v1';
const SERVER_PREF_KEY = 'librarySettings';
const SERVER_OVERRIDE_PREF_KEY = 'librarySettingsOverrides.v1';
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

    const isAdmin = Boolean(user?.Policy?.IsAdministrator);

    const storageKey = useMemo(() => [
        STORAGE_PREFIX,
        apiClient?.serverId() ?? 'server',
        user?.Id ?? 'user'
    ].join(':'), [apiClient, user?.Id]);

    const activeStorageKey = useRef(storageKey);
    const serverSaveTimer = useRef<number | null>(null);
    const pendingServerValue =
        useRef<MinitigerLibrarySettings | null>(null);

    const [ settings, setSettings ] = useState<MinitigerLibrarySettings>(
        () => readSettings(storageKey)
    );

    const cache = useCallback((
        value: MinitigerLibrarySettings
    ) => {
        try {
            window.localStorage.setItem(
                activeStorageKey.current,
                JSON.stringify(value)
            );
        } catch (error) {
            console.warn(
                '[Minitiger Library Settings] Einstellungen konnten nicht gespeichert werden',
                error
            );
        }
    }, []);

    useEffect(() => {
        if (activeStorageKey.current === storageKey) {
            return;
        }

        activeStorageKey.current = storageKey;
        setSettings(readSettings(storageKey));
    }, [storageKey]);

    useEffect(() => {
        const onSync = (event: Event) => {
            const custom =
                event as CustomEvent<MinitigerLibrarySettings>;

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

    useEffect(() => {
        const userId = user?.Id;

        if (!apiClient || !userId) {
            return;
        }

        let cancelled = false;

        void readMinitigerServerPreference<MinitigerLibrarySettings>(
            apiClient,
            userId,
            SERVER_PREF_KEY
        ).then(serverValue => {
            if (cancelled) {
                return;
            }

            if (serverValue) {
                const normalized =
                    normalizeLibrarySettings(serverValue);

                setSettings(normalized);
                cache(normalized);
                return;
            }

            if (isAdmin) {
                const localValue =
                    readSettings(activeStorageKey.current);

                void broadcastMinitigerServerPreference(
                    apiClient,
                    SERVER_PREF_KEY,
                    localValue,
                    [],
                    SERVER_OVERRIDE_PREF_KEY
                ).catch(error => {
                    console.warn(
                        '[Minitiger Library Settings] Initiale Admin-Standards konnten nicht synchronisiert werden.',
                        error
                    );
                });
            }
        });

        return () => {
            cancelled = true;
        };
    }, [
        apiClient,
        cache,
        isAdmin,
        user?.Id
    ]);

    const saveToServer = useCallback((
        value: MinitigerLibrarySettings
    ) => {
        const userId = user?.Id;

        if (!apiClient || !userId) {
            return;
        }

        pendingServerValue.current = value;

        if (serverSaveTimer.current != null) {
            window.clearTimeout(serverSaveTimer.current);
        }

        serverSaveTimer.current = window.setTimeout(() => {
            serverSaveTimer.current = null;

            const pending = pendingServerValue.current;
            pendingServerValue.current = null;

            if (!pending) {
                return;
            }

            const request =
                isAdmin
                    ? broadcastMinitigerServerPreference(
                        apiClient,
                        SERVER_PREF_KEY,
                        pending,
                        [],
                        SERVER_OVERRIDE_PREF_KEY
                    )
                    : writeMinitigerServerPreference(
                        apiClient,
                        userId,
                        SERVER_PREF_KEY,
                        pending
                    );

            void request.catch(error => {
                console.warn(
                    '[Minitiger Library Settings] Server-Speichern fehlgeschlagen.',
                    error
                );
            });
        }, 450);
    }, [
        apiClient,
        isAdmin,
        user?.Id
    ]);

    useEffect(() => () => {
        if (serverSaveTimer.current != null) {
            window.clearTimeout(serverSaveTimer.current);
        }
    }, []);

    const persist = useCallback((
        next: MinitigerLibrarySettings
    ) => {
        const normalized = normalizeLibrarySettings(next);

        setSettings(normalized);
        cache(normalized);
        saveToServer(normalized);

        window.dispatchEvent(
            new CustomEvent<MinitigerLibrarySettings>(
                SYNC_EVENT,
                { detail: normalized }
            )
        );
    }, [
        cache,
        saveToServer
    ]);

    const updateSettings = useCallback((
        patch: Partial<MinitigerLibrarySettings>
    ) => {
        setSettings(current => {
            const next = normalizeLibrarySettings({
                ...current,
                ...patch
            });

            cache(next);
            saveToServer(next);

            if (
                !isAdmin
                && apiClient
                && user?.Id
            ) {
                void addMinitigerServerPreferenceOverrides(
                    apiClient,
                    user.Id,
                    SERVER_OVERRIDE_PREF_KEY,
                    Object.keys(patch)
                ).catch(error => {
                    console.warn(
                        '[Minitiger Library Settings] Persönliche Overrides konnten nicht gespeichert werden.',
                        error
                    );
                });
            }

            window.dispatchEvent(
                new CustomEvent<MinitigerLibrarySettings>(
                    SYNC_EVENT,
                    { detail: next }
                )
            );

            return next;
        });
    }, [
        apiClient,
        cache,
        isAdmin,
        saveToServer,
        user?.Id
    ]);

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
