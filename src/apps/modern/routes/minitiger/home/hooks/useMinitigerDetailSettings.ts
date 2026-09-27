import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';

import { useApi } from 'hooks/useApi';

import {
    DEFAULT_DETAIL_SETTINGS,
    type MinitigerDetailSettings,
    normalizeDetailSettings
} from '../config/detailSettings';
import {
    addMinitigerServerPreferenceOverrides,
    broadcastMinitigerServerPreference,
    readMinitigerServerPreference,
    writeMinitigerServerPreference
} from '../serverPreferences';

const STORAGE_PREFIX =
    'Minitiger.DetailSettings.v1';
const SERVER_PREF_KEY =
    'detailSettings';
const SERVER_OVERRIDE_PREF_KEY =
    'detailSettingsOverrides.v1';
const SYNC_EVENT =
    'minitiger:detail-settings-changed';

const readSettings = (
    storageKey: string
) => {
    try {
        const raw =
            window.localStorage.getItem(
                storageKey
            );

        if (!raw) {
            return DEFAULT_DETAIL_SETTINGS;
        }

        return normalizeDetailSettings(
            JSON.parse(raw)
        );
    } catch (error) {
        console.warn(
            '[Minitiger Detail Settings] Einstellungen konnten nicht gelesen werden',
            error
        );

        return DEFAULT_DETAIL_SETTINGS;
    }
};

const useMinitigerDetailSettings = () => {
    const {
        user,
        __legacyApiClient__: apiClient
    } = useApi();

    const isAdmin = Boolean(
        user?.Policy?.IsAdministrator
    );

    const storageKey = useMemo(
        () => [
            STORAGE_PREFIX,
            apiClient?.serverId()
            ?? 'server',
            user?.Id
            ?? 'user'
        ].join(':'),
        [
            apiClient,
            user?.Id
        ]
    );

    const activeStorageKey =
        useRef(storageKey);

    const serverSaveTimer =
        useRef<number | null>(null);

    const pendingServerValue =
        useRef<MinitigerDetailSettings | null>(null);

    const [
        settings,
        setSettings
    ] = useState<MinitigerDetailSettings>(
        () => readSettings(storageKey)
    );

    const cache = useCallback((
        value: MinitigerDetailSettings
    ) => {
        try {
            window.localStorage.setItem(
                activeStorageKey.current,
                JSON.stringify(value)
            );
        } catch (error) {
            console.warn(
                '[Minitiger Detail Settings] Einstellungen konnten nicht gespeichert werden',
                error
            );
        }
    }, []);

    useEffect(() => {
        if (
            activeStorageKey.current
            === storageKey
        ) {
            return;
        }

        activeStorageKey.current =
            storageKey;

        setSettings(
            readSettings(storageKey)
        );
    }, [storageKey]);

    useEffect(() => {
        const root = document.documentElement;

        root.dataset.minitigerDetailLayout =
            settings.layoutMode;
        root.dataset.minitigerShowStudios =
            settings.showStudios ? 'true' : 'false';
        root.dataset.minitigerShowGenres =
            settings.showGenres ? 'true' : 'false';
    }, [
        settings.layoutMode,
        settings.showGenres,
        settings.showStudios
    ]);

    useEffect(() => {
        const onSync = (event: Event) => {
            const custom =
                event as CustomEvent<MinitigerDetailSettings>;

            if (!custom.detail) {
                return;
            }

            setSettings(
                normalizeDetailSettings(custom.detail)
            );
        };

        window.addEventListener(
            SYNC_EVENT,
            onSync
        );

        return () => {
            window.removeEventListener(
                SYNC_EVENT,
                onSync
            );
        };
    }, []);

    useEffect(() => {
        const userId = user?.Id;

        if (!apiClient || !userId) {
            return;
        }

        let cancelled = false;

        void readMinitigerServerPreference<MinitigerDetailSettings>(
            apiClient,
            userId,
            SERVER_PREF_KEY
        ).then(serverValue => {
            if (cancelled) {
                return;
            }

            if (serverValue) {
                const normalized =
                    normalizeDetailSettings(serverValue);

                setSettings(normalized);
                cache(normalized);

                if (isAdmin) {
                    void broadcastMinitigerServerPreference(
                        apiClient,
                        SERVER_PREF_KEY,
                        normalized,
                        [],
                        SERVER_OVERRIDE_PREF_KEY
                    ).catch(error => {
                        console.warn(
                            '[Minitiger Detail Settings] Admin-Standards konnten nicht an alle Benutzer verteilt werden.',
                            error
                        );
                    });
                }

                return;
            }

            if (isAdmin) {
                const localValue =
                    readSettings(
                        activeStorageKey.current
                    );

                void broadcastMinitigerServerPreference(
                    apiClient,
                    SERVER_PREF_KEY,
                    localValue,
                    [],
                    SERVER_OVERRIDE_PREF_KEY
                ).catch(error => {
                    console.warn(
                        '[Minitiger Detail Settings] Initiale Admin-Standards konnten nicht synchronisiert werden.',
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
        value: MinitigerDetailSettings
    ) => {
        const userId = user?.Id;

        if (!apiClient || !userId) {
            return;
        }

        pendingServerValue.current = value;

        if (serverSaveTimer.current != null) {
            window.clearTimeout(
                serverSaveTimer.current
            );
        }

        serverSaveTimer.current =
            window.setTimeout(() => {
                serverSaveTimer.current = null;

                const pending =
                    pendingServerValue.current;

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
                        '[Minitiger Detail Settings] Server-Speichern fehlgeschlagen.',
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
        if (
            serverSaveTimer.current
            != null
        ) {
            window.clearTimeout(
                serverSaveTimer.current
            );
        }
    }, []);

    const persist = useCallback((
        next: MinitigerDetailSettings
    ) => {
        const normalized =
            normalizeDetailSettings(next);

        setSettings(normalized);
        cache(normalized);
        saveToServer(normalized);

        window.setTimeout(() => {
            window.dispatchEvent(
                new CustomEvent<MinitigerDetailSettings>(
                    SYNC_EVENT,
                    { detail: normalized }
                )
            );
        }, 0);
    }, [
        cache,
        saveToServer
    ]);

    const updateSettings =
        useCallback((
            patch:
                Partial<MinitigerDetailSettings>
        ) => {
            setSettings(current => {
                const next =
                    normalizeDetailSettings({
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
                            '[Minitiger Detail Settings] Persönliche Overrides konnten nicht gespeichert werden.',
                            error
                        );
                    });
                }

                window.setTimeout(() => {
                    window.dispatchEvent(
                        new CustomEvent<MinitigerDetailSettings>(
                            SYNC_EVENT,
                            { detail: next }
                        )
                    );
                }, 0);

                return next;
            });
        }, [
            apiClient,
            cache,
            isAdmin,
            saveToServer,
            user?.Id
        ]);

    const resetSettings =
        useCallback(() => {
            persist(
                DEFAULT_DETAIL_SETTINGS
            );
        }, [persist]);

    return {
        settings,
        updateSettings,
        resetSettings,
        replaceSettings: persist
    };
};

export default useMinitigerDetailSettings;

// MINITIGER_PATCH_MARKER: PHASE_18_18_1_SAFE_DETAIL_SETTINGS_SYNC
