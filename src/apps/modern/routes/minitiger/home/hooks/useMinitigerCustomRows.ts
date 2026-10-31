import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';

import { useApi } from 'hooks/useApi';

import {
    DEFAULT_CUSTOM_ROWS,
    type MinitigerCustomRow,
    type MinitigerCustomRowsConfig,
    normalizeCustomRows
} from '../config/customRows';
import {
    broadcastMinitigerServerPreference,
    readMinitigerServerPreferenceDetailed,
    writeMinitigerServerPreference
} from '../serverPreferences';

const STORAGE_PREFIX = 'Minitiger.CustomRows.v1';
const SERVER_PREF_KEY = 'customRows';

const cloneDefaults = (): MinitigerCustomRowsConfig => ({
    rows: DEFAULT_CUSTOM_ROWS.rows.map(row => ({
        ...row
    }))
});

const readConfig = (storageKey: string) => {
    try {
        const raw = window.localStorage.getItem(storageKey);

        if (!raw) {
            return cloneDefaults();
        }

        return normalizeCustomRows(JSON.parse(raw));
    } catch (error) {
        console.warn(
            '[Minitiger CustomRows] Konfiguration konnte nicht gelesen werden',
            error
        );

        return cloneDefaults();
    }
};

const useMinitigerCustomRows = () => {
    const {
        user,
        __legacyApiClient__: apiClient
    } = useApi();

    const isAdmin = Boolean(user?.Policy?.IsAdministrator);

    const storageKey = useMemo(() => [
        STORAGE_PREFIX,
        apiClient?.serverId() ?? 'server'
    ].join(':'), [apiClient]);

    const activeStorageKey = useRef(storageKey);
    const [ config, setConfig ] = useState<MinitigerCustomRowsConfig>(
        () => readConfig(storageKey)
    );

    const serverSaveTimer = useRef<number | null>(null);
    const pendingServerValue = useRef<MinitigerCustomRowsConfig | null>(null);

    useEffect(() => {
        if (activeStorageKey.current === storageKey) {
            return;
        }

        activeStorageKey.current = storageKey;
        setConfig(readConfig(storageKey));
    }, [storageKey]);

    useEffect(() => {
        const userId = user?.Id;

        if (!apiClient || !userId) {
            return;
        }

        let cancelled = false;

        void readMinitigerServerPreferenceDetailed<MinitigerCustomRowsConfig>(
            apiClient,
            userId,
            SERVER_PREF_KEY
        ).then(({ value: serverValue, failed }) => {
            if (cancelled) {
                return;
            }

            // A failed read (e.g. aborted while navigating quickly) is not
            // "nothing stored": never seed or broadcast defaults from it.
            if (failed) {
                return;
            }

            if (serverValue) {
                const normalized = normalizeCustomRows(serverValue);
                setConfig(normalized);

                try {
                    window.localStorage.setItem(
                        activeStorageKey.current,
                        JSON.stringify(normalized)
                    );
                } catch {
                    // Server value is still authoritative.
                }

                return;
            }

            if (isAdmin) {
                const localValue = readConfig(
                    activeStorageKey.current
                );

                void broadcastMinitigerServerPreference(
                    apiClient,
                    SERVER_PREF_KEY,
                    localValue
                ).catch(error => {
                    console.warn(
                        '[Minitiger Custom Rows] Initiale Server-Synchronisierung ist fehlgeschlagen.',
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
        isAdmin,
        user?.Id
    ]);

    const saveToServer = useCallback((
        nextValue: MinitigerCustomRowsConfig
    ) => {
        const userId = user?.Id;

        if (!apiClient || !userId) {
            return;
        }

        pendingServerValue.current = nextValue;

        if (serverSaveTimer.current != null) {
            window.clearTimeout(serverSaveTimer.current);
        }

        serverSaveTimer.current = window.setTimeout(() => {
            serverSaveTimer.current = null;

            const value = pendingServerValue.current;
            pendingServerValue.current = null;

            if (!value) {
                return;
            }

            const writePromise =
                isAdmin
                    ? broadcastMinitigerServerPreference(
                        apiClient,
                        SERVER_PREF_KEY,
                        value
                    )
                    : writeMinitigerServerPreference(
                        apiClient,
                        userId,
                        SERVER_PREF_KEY,
                        value
                    );

            void writePromise.catch(error => {
                console.warn(
                    '[Minitiger Custom Rows] Server-Speichern fehlgeschlagen.',
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
        nextValue: MinitigerCustomRowsConfig
    ) => {
        const normalized = normalizeCustomRows(nextValue);

        try {
            window.localStorage.setItem(
                activeStorageKey.current,
                JSON.stringify(normalized)
            );
        } catch (error) {
            console.warn(
                '[Minitiger CustomRows] Konfiguration konnte nicht gespeichert werden',
                error
            );
        }

        setConfig(normalized);
        saveToServer(normalized);
    }, [saveToServer]);

    const updateRow = useCallback((
        rowKey: string,
        patch: Partial<Omit<MinitigerCustomRow, 'key'>>
    ) => {
        setConfig(current => {
            const next = normalizeCustomRows({
                rows: current.rows.map(row => (
                    row.key === rowKey
                        ? {
                            ...row,
                            ...patch
                        }
                        : row
                ))
            });

            try {
                window.localStorage.setItem(
                    activeStorageKey.current,
                    JSON.stringify(next)
                );
            } catch (error) {
                console.warn(
                    '[Minitiger CustomRows] Konfiguration konnte nicht gespeichert werden',
                    error
                );
            }

            saveToServer(next);
            return next;
        });
    }, [saveToServer]);

    const replaceConfig = useCallback((
        value: MinitigerCustomRowsConfig
    ) => {
        persist(value);
    }, [persist]);

    const resetCustomRows = useCallback(() => {
        persist(cloneDefaults());
    }, [persist]);

    return {
        config,
        updateRow,
        replaceConfig,
        resetCustomRows
    };
};

export default useMinitigerCustomRows;
// MINITIGER_PATCH_MARKER: PHASE_18_13_0_TEST_STABILITY_TRANSLATOR_BACKGROUND
