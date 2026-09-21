import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';

import { useApi } from 'hooks/useApi';

import {
    DEFAULT_HOME_SETTINGS,
    type HomeRowId,
    type HomeSectionId,
    type MinitigerHomeSettings,
    normalizeHomeSettings
} from '../config/homeSettings';
import {
    broadcastMinitigerServerPreference,
    readMinitigerServerPreference,
    writeMinitigerServerPreference
} from '../serverPreferences';
import {
    readMinitigerToolbarBranding,
    writeMinitigerToolbarBranding
} from '../toolbarBranding';

const STORAGE_PREFIX = 'Minitiger.NativeHomeSettings.v1';
const SERVER_PREF_KEY = 'homeSettings';
const SYNC_EVENT = 'minitiger:home-settings-changed';

const PERSONAL_HOME_SETTING_KEYS: Array<keyof MinitigerHomeSettings> = [
    'accentColor',
    'primaryHoverColor',
    'secondaryColor',
    'secondaryHoverColor',
    'libraryBarColor',
    'libraryBarTextColor',
    'bannerMetaColor',
    'glowColor',
    'arrowColor',
    'genreTagColor',
    'glowStrength',
    'glowSize',
    'toolbarBrandTextEnabled',
    'toolbarBrandText',
    'bannerFskVisible',
    'showAudioFlags',
    'showFskBadges',
    'showPlayedIndicators',
    'playedIndicatorSize',
    'playedIndicatorFontSize',
    'playedIndicatorShape',
    'hoverEnabled',
    'glowEnabled',
    'previewEnabled',
    'preferredPlayer'
];

const TOOLBAR_BRANDING_SETTING_KEYS: Array<keyof MinitigerHomeSettings> = [
    'toolbarBrandLogoEnabled',
    'toolbarBrandLogoUrl',
    'toolbarBrandLogoSize'
];

const isNonBroadcastHomePatch = (
    patch: Partial<MinitigerHomeSettings>
) => {
    const keys =
        Object.keys(
            patch
        ) as Array<keyof MinitigerHomeSettings>;

    if (!keys.length) {
        return true;
    }

    return keys.every(key =>
        PERSONAL_HOME_SETTING_KEYS.includes(key)
        || TOOLBAR_BRANDING_SETTING_KEYS.includes(key)
    );
};

const cloneDefaults = (): MinitigerHomeSettings => ({
    ...DEFAULT_HOME_SETTINGS,
    sectionOrder: [
        ...DEFAULT_HOME_SETTINGS.sectionOrder
    ],
    homeRowOrder: [
        ...DEFAULT_HOME_SETTINGS.homeRowOrder
    ],
    visibleSections: {
        ...DEFAULT_HOME_SETTINGS.visibleSections
    }
});

const readSettings = (storageKey: string) => {
    try {
        const raw = window.localStorage.getItem(storageKey);

        if (!raw) {
            return cloneDefaults();
        }

        return normalizeHomeSettings(JSON.parse(raw));
    } catch (error) {
        console.warn(
            '[Minitiger Settings] Einstellungen konnten nicht gelesen werden',
            error
        );

        return cloneDefaults();
    }
};

const useMinitigerHomeSettings = () => {
    const {
        user,
        __legacyApiClient__: apiClient
    } = useApi();

    const isAdmin = Boolean(user?.Policy?.IsAdministrator);

    const storageKey = useMemo(() => [
        STORAGE_PREFIX,
        apiClient?.serverId() ?? 'server',
        user?.Id ?? 'user'
    ].join(':'), [ apiClient, user?.Id ]);

    const activeStorageKey = useRef(storageKey);

    const [ settings, setSettingsState ] =
        useState<MinitigerHomeSettings>(
            () => readSettings(storageKey)
        );

    useEffect(() => {
        console.info(
            '[Minitiger Desktop Compat] home settings '
            + JSON.stringify({
                origin: window.location.origin,
                storageKey,
                hasLocalValue: Boolean(
                    window.localStorage.getItem(storageKey)
                ),
                hoverEnabled: settings.hoverEnabled,
                glowEnabled: settings.glowEnabled,
                glowStrength: settings.glowStrength,
                glowSize: settings.glowSize,
                previewEnabled: settings.previewEnabled,
                customHomeRowsEnabled: settings.customHomeRowsEnabled,
                cardSize: settings.cardSize,
                showAudioFlags: settings.showAudioFlags,
                showFskBadges: settings.showFskBadges,
                showPlayedIndicators: settings.showPlayedIndicators
            })
        );
    }, [
        storageKey,
        settings.cardSize,
        settings.customHomeRowsEnabled,
        settings.glowEnabled,
        settings.glowSize,
        settings.glowStrength,
        settings.hoverEnabled,
        settings.previewEnabled,
        settings.showAudioFlags,
        settings.showFskBadges,
        settings.showPlayedIndicators
    ]);

    const serverSaveTimer = useRef<number | null>(null);
    const pendingServerValue = useRef<MinitigerHomeSettings | null>(null);
    const pendingServerBroadcast = useRef(false);
    const toolbarBrandingResolved = useRef(false);

    useEffect(() => {
        if (activeStorageKey.current === storageKey) {
            return;
        }

        activeStorageKey.current = storageKey;
        setSettingsState(readSettings(storageKey));
    }, [ storageKey ]);

    useEffect(() => {
        const onSync = (event: Event) => {
            const custom = event as CustomEvent<MinitigerHomeSettings>;

            if (!custom.detail) {
                return;
            }

            setSettingsState(
                normalizeHomeSettings(custom.detail)
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

        void readMinitigerServerPreference<MinitigerHomeSettings>(
            apiClient,
            userId,
            SERVER_PREF_KEY
        ).then(serverValue => {
            if (cancelled) {
                return;
            }

            if (serverValue) {
                setSettingsState(current => {
                    /*
                     * Toolbar branding is server-global and must never be
                     * overwritten by an older per-user Home preference.
                     */
                    const normalized = normalizeHomeSettings({
                        ...serverValue,
                        toolbarBrandLogoEnabled:
                            current.toolbarBrandLogoEnabled,
                        toolbarBrandLogoUrl:
                            current.toolbarBrandLogoUrl,
                        toolbarBrandLogoSize:
                            current.toolbarBrandLogoSize
                    });

                    try {
                        window.localStorage.setItem(
                            activeStorageKey.current,
                            JSON.stringify(normalized)
                        );
                    } catch {
                        // Server value remains authoritative for this load.
                    }

                    return normalized;
                });

                return;
            }

            if (isAdmin) {
                const localValue = readSettings(
                    activeStorageKey.current
                );

                void broadcastMinitigerServerPreference(
                    apiClient,
                    SERVER_PREF_KEY,
                    localValue,
                    PERSONAL_HOME_SETTING_KEYS
                ).catch(error => {
                    console.warn(
                        '[Minitiger Settings] Initiale Server-Synchronisierung ist fehlgeschlagen.',
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


    useEffect(() => {
        toolbarBrandingResolved.current = false;
    }, [
        apiClient,
        user?.Id
    ]);

    useEffect(() => {
        if (!apiClient || toolbarBrandingResolved.current) {
            return;
        }

        let cancelled = false;

        const applyGlobalBranding = (
            globalBranding: {
                enabled: boolean;
                image: string;
                size: number;
            }
        ) => {
            if (cancelled) {
                return;
            }

            toolbarBrandingResolved.current = true;

            setSettingsState(current => {
                const next = normalizeHomeSettings({
                    ...current,
                    toolbarBrandLogoEnabled:
                        globalBranding.enabled,
                    toolbarBrandLogoUrl:
                        globalBranding.image,
                    toolbarBrandLogoSize:
                        globalBranding.size
                });

                try {
                    window.localStorage.setItem(
                        activeStorageKey.current,
                        JSON.stringify(next)
                    );
                } catch {
                    // In-memory settings are enough for this session.
                }

                return next;
            });
        };

        const load = async () => {
            const globalBranding =
                await readMinitigerToolbarBranding(
                    apiClient
                );

            if (cancelled) {
                return;
            }

            if (globalBranding) {
                applyGlobalBranding(globalBranding);
                return;
            }

            if (!isAdmin) {
                toolbarBrandingResolved.current = true;
                return;
            }

            /*
             * One-time migration path for older 18.8/18.12 builds.
             * Read the legacy value directly instead of waiting for a
             * state dependency loop to fire again.
             */
            const userId = user?.Id;
            const legacy =
                userId
                    ? await readMinitigerServerPreference<MinitigerHomeSettings>(
                        apiClient,
                        userId,
                        SERVER_PREF_KEY
                    )
                    : null;

            if (cancelled) {
                return;
            }

            if (
                legacy
                && (
                    legacy.toolbarBrandLogoUrl
                    || legacy.toolbarBrandLogoEnabled
                )
            ) {
                const migrated = {
                    enabled:
                        legacy.toolbarBrandLogoEnabled,
                    image:
                        legacy.toolbarBrandLogoUrl,
                    size:
                        legacy.toolbarBrandLogoSize
                };

                await writeMinitigerToolbarBranding(
                    apiClient,
                    migrated
                );

                applyGlobalBranding(migrated);
                return;
            }

            toolbarBrandingResolved.current = true;
        };

        void load().catch(error => {
            toolbarBrandingResolved.current = false;
            console.warn(
                '[Minitiger Branding] Globales Toolbar-Branding konnte nicht geladen werden.',
                error
            );
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
        value: MinitigerHomeSettings,
        broadcastForAdmin = true
    ) => {
        const userId = user?.Id;

        if (!apiClient || !userId) {
            return;
        }

        pendingServerValue.current = value;
        pendingServerBroadcast.current =
            pendingServerBroadcast.current
            || broadcastForAdmin;

        if (serverSaveTimer.current != null) {
            window.clearTimeout(serverSaveTimer.current);
        }

        serverSaveTimer.current = window.setTimeout(() => {
            serverSaveTimer.current = null;

            const pending = pendingServerValue.current;
            const shouldBroadcast =
                pendingServerBroadcast.current;

            pendingServerValue.current = null;
            pendingServerBroadcast.current = false;

            if (!pending) {
                return;
            }

            const writePromise =
                isAdmin && shouldBroadcast
                    ? broadcastMinitigerServerPreference(
                        apiClient,
                        SERVER_PREF_KEY,
                        pending,
                        PERSONAL_HOME_SETTING_KEYS
                    )
                    : writeMinitigerServerPreference(
                        apiClient,
                        userId,
                        SERVER_PREF_KEY,
                        pending
                    );

            void writePromise.catch(error => {
                console.warn(
                    '[Minitiger Settings] Server-Speichern fehlgeschlagen.',
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

    const saveLocal = useCallback((
        value: MinitigerHomeSettings,
        warning: string,
        broadcastForAdmin = true
    ) => {
        try {
            window.localStorage.setItem(
                activeStorageKey.current,
                JSON.stringify(value)
            );
        } catch (error) {
            console.warn(warning, error);
        }

        /*
         * React may execute functional state updaters while rendering the
         * component that owns this hook. Dispatching synchronously here
         * would make the second mounted settings hook update another
         * component during that render. Defer only the cross-component
         * notification to the next task.
         */
        window.setTimeout(() => {
            window.dispatchEvent(
                new CustomEvent<MinitigerHomeSettings>(
                    SYNC_EVENT,
                    { detail: value }
                )
            );
        }, 0);

        saveToServer(value, broadcastForAdmin);
    }, [saveToServer]);

    const persist = useCallback((
        nextSettings: MinitigerHomeSettings
    ) => {
        const normalized =
            normalizeHomeSettings(nextSettings);

        setSettingsState(normalized);
        saveLocal(
            normalized,
            '[Minitiger Settings] Einstellungen konnten nicht gespeichert werden'
        );
    }, [saveLocal]);

    const updateSettings = useCallback((
        patch: Partial<MinitigerHomeSettings>
    ) => {
        setSettingsState(current => {
            const next = normalizeHomeSettings({
                ...current,
                ...patch
            });

            const broadcastForAdmin =
                !isNonBroadcastHomePatch(patch);

            saveLocal(
                next,
                '[Minitiger Settings] Einstellungen konnten nicht gespeichert werden',
                broadcastForAdmin
            );

            const toolbarBrandingChanged =
                Object.prototype.hasOwnProperty.call(
                    patch,
                    'toolbarBrandLogoEnabled'
                )
                || Object.prototype.hasOwnProperty.call(
                    patch,
                    'toolbarBrandLogoUrl'
                )
                || Object.prototype.hasOwnProperty.call(
                    patch,
                    'toolbarBrandLogoSize'
                );

            if (
                toolbarBrandingChanged
                && isAdmin
                && apiClient
            ) {
                toolbarBrandingResolved.current = true;

                void writeMinitigerToolbarBranding(
                    apiClient,
                    {
                        enabled:
                            next.toolbarBrandLogoEnabled,
                        image:
                            next.toolbarBrandLogoUrl,
                        size:
                            next.toolbarBrandLogoSize
                    }
                ).catch(error => {
                    console.warn(
                        '[Minitiger Branding] Globales Toolbar-Branding konnte nicht gespeichert werden.',
                        error
                    );
                });
            }

            return next;
        });
    }, [
        apiClient,
        isAdmin,
        saveLocal
    ]);

    const toggleSection = useCallback((
        sectionId: HomeSectionId
    ) => {
        setSettingsState(current => {
            const next = normalizeHomeSettings({
                ...current,
                visibleSections: {
                    ...current.visibleSections,
                    [sectionId]:
                        !current.visibleSections[sectionId]
                }
            });

            saveLocal(
                next,
                '[Minitiger Settings] Einstellungen konnten nicht gespeichert werden'
            );

            return next;
        });
    }, [saveLocal]);

    const moveHomeRow = useCallback((
        rowId: HomeRowId,
        direction: -1 | 1
    ) => {
        setSettingsState(current => {
            const currentIndex =
                current.homeRowOrder.indexOf(rowId);
            const targetIndex =
                currentIndex + direction;

            if (
                currentIndex < 0
                || targetIndex < 0
                || targetIndex >= current.homeRowOrder.length
            ) {
                return current;
            }

            const nextOrder = [
                ...current.homeRowOrder
            ];

            const [ moved ] =
                nextOrder.splice(currentIndex, 1);

            nextOrder.splice(
                targetIndex,
                0,
                moved
            );

            const next = normalizeHomeSettings({
                ...current,
                homeRowOrder: nextOrder
            });

            saveLocal(
                next,
                '[Minitiger Settings] Einstellungen konnten nicht gespeichert werden'
            );

            return next;
        });
    }, [saveLocal]);

    const reorderHomeRows = useCallback((
        sourceId: HomeRowId,
        targetId: HomeRowId
    ) => {
        if (sourceId === targetId) {
            return;
        }

        setSettingsState(current => {
            const nextOrder = [
                ...current.homeRowOrder
            ];

            const sourceIndex =
                nextOrder.indexOf(sourceId);
            const targetIndex =
                nextOrder.indexOf(targetId);

            if (
                sourceIndex < 0
                || targetIndex < 0
            ) {
                return current;
            }

            const [ moved ] =
                nextOrder.splice(sourceIndex, 1);

            nextOrder.splice(
                targetIndex,
                0,
                moved
            );

            const next = normalizeHomeSettings({
                ...current,
                homeRowOrder: nextOrder
            });

            saveLocal(
                next,
                '[Minitiger Settings] Reihenfolge konnte nicht gespeichert werden'
            );

            return next;
        });
    }, [saveLocal]);

    /**
     * Legacy helper retained for older call sites. New UI uses
     * moveHomeRow so system/custom/virtual rows can share one order.
     */
    const moveSection = useCallback((
        sectionId: HomeSectionId,
        direction: -1 | 1
    ) => {
        if (sectionId === 'libraries') {
            return;
        }

        moveHomeRow(
            sectionId as HomeRowId,
            direction
        );
    }, [moveHomeRow]);

    const resetSettings = useCallback(() => {
        persist(cloneDefaults());
    }, [persist]);

    return {
        settings,
        updateSettings,
        toggleSection,
        moveSection,
        moveHomeRow,
        reorderHomeRows,
        resetSettings
    };
};

export default useMinitigerHomeSettings;

// MINITIGER_PATCH_MARKER: PHASE_18_12_3_TEST_HOME_USER_POLISH

// MINITIGER_PATCH_MARKER: PHASE_18_12_4_TEST_BANNER_AVATAR_GLOBAL
// MINITIGER_PATCH_MARKER: PHASE_18_13_0_TEST_STABILITY_TRANSLATOR_BACKGROUND

// MINITIGER_PATCH_MARKER: PHASE_18_18_1_SAFE_SETTINGS_SYNC

// MINITIGER_PATCH_MARKER: PHASE_18_23_0A_VLC_PREFERENCE_BRIDGE_CHECK
