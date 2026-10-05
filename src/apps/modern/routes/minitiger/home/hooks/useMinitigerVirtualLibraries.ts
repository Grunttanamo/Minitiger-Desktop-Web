import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';

import { useApi } from 'hooks/useApi';

import {
    DEFAULT_VIRTUAL_LIBRARIES,
    type MinitigerVirtualDisplay,
    type MinitigerVirtualLibrariesConfig,
    type MinitigerVirtualRowId,
    normalizeVirtualLibraries
} from '../config/virtualLibraries';
import {
    deleteVirtualVideo,
    getVirtualVideo,
    putVirtualVideo
} from '../virtualMediaStore';
import {
    deleteMinitigerVirtualServerMedia,
    MinitigerVirtualSyncUnavailableError,
    type MinitigerVirtualMediaKind,
    readMinitigerVirtualServerConfig,
    uploadMinitigerVirtualServerMedia,
    writeMinitigerVirtualServerConfig
} from '../virtualServerSync';

const STORAGE_PREFIX = 'Minitiger.VirtualLibraries.v1';

export type MinitigerVirtualSyncStatus =
    | 'loading'
    | 'migrating'
    | 'server'
    | 'local'
    | 'error';

const cloneDefaults = (): MinitigerVirtualLibrariesConfig => ({
    ...DEFAULT_VIRTUAL_LIBRARIES,
    libraries: [],
    homeOrder: [],
    rowEnabled: {
        ...DEFAULT_VIRTUAL_LIBRARIES.rowEnabled
    },
    rowTitles: {
        ...DEFAULT_VIRTUAL_LIBRARIES.rowTitles
    },
    rowTitleVisible: {
        ...DEFAULT_VIRTUAL_LIBRARIES.rowTitleVisible
    }
});

const readConfig = (storageKey: string) => {
    try {
        const raw = window.localStorage.getItem(storageKey);

        if (!raw) {
            return cloneDefaults();
        }

        return normalizeVirtualLibraries(JSON.parse(raw));
    } catch (error) {
        console.warn(
            '[Minitiger Virtual] Konfiguration konnte nicht gelesen werden',
            error
        );

        return cloneDefaults();
    }
};

const writeConfigCache = (
    storageKey: string,
    config: MinitigerVirtualLibrariesConfig
) => {
    try {
        window.localStorage.setItem(
            storageKey,
            JSON.stringify(config)
        );
    } catch (error) {
        console.warn(
            '[Minitiger Virtual] Lokaler Cache konnte nicht gespeichert werden',
            error
        );
    }
};

const createLibraryId = () => (
    `virtual-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 7)}`
);

const readFileAsDataUrl = (file: Blob) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(
            reader.error ?? new Error('Datei konnte nicht gelesen werden.')
        );
        reader.readAsDataURL(file);
    });

const dataUrlToBlob = async (dataUrl: string) => {
    const response = await fetch(dataUrl);
    return await response.blob();
};

const imageFileName = (blob: Blob) => {
    switch (blob.type.toLowerCase()) {
        case 'image/jpeg':
            return 'image.jpg';
        case 'image/webp':
            return 'image.webp';
        case 'image/gif':
            return 'image.gif';
        default:
            return 'image.png';
    }
};

const useMinitigerVirtualLibraries = () => {
    const {
        user,
        __legacyApiClient__: apiClient
    } = useApi();
    const isAdmin = Boolean(user?.Policy?.IsAdministrator);

    const storageKey = useMemo(() => [
        STORAGE_PREFIX,
        apiClient?.serverId() ?? 'server'
    ].join(':'), [apiClient]);

    const initialConfig = useMemo(
        () => readConfig(storageKey),
        [storageKey]
    );

    const activeStorageKey = useRef(storageKey);
    const startupLocalConfig = useRef(initialConfig);
    const serverAvailable = useRef(false);
    const configRef = useRef(initialConfig);
    const writeTimer = useRef<number | undefined>();
    const writeGeneration = useRef(0);

    const [ config, setConfig ] = useState<MinitigerVirtualLibrariesConfig>(
        initialConfig
    );
    const [ syncStatus, setSyncStatus ] =
        useState<MinitigerVirtualSyncStatus>('loading');
    const [ syncMessage, setSyncMessage ] = useState('');

    useEffect(() => {
        configRef.current = config;
    }, [config]);

    const applyConfig = useCallback((
        next: MinitigerVirtualLibrariesConfig,
        cacheKey = activeStorageKey.current
    ) => {
        const normalized = normalizeVirtualLibraries(next);
        configRef.current = normalized;
        setConfig(normalized);
        writeConfigCache(cacheKey, normalized);
        return normalized;
    }, []);

    const migrateSnapshotToServer = useCallback(async (
        snapshot: MinitigerVirtualLibrariesConfig
    ) => {
        if (!apiClient || !isAdmin) {
            throw new Error('Server-Migration erfordert einen Administrator.');
        }

        const libraries: MinitigerVirtualLibrariesConfig['libraries'] = [];

        for (const library of snapshot.libraries) {
            const migrated = { ...library };

            if (migrated.image?.startsWith('data:')) {
                try {
                    const blob = await dataUrlToBlob(migrated.image);
                    const result = await uploadMinitigerVirtualServerMedia(
                        apiClient,
                        migrated.id,
                        'image',
                        blob,
                        imageFileName(blob)
                    );

                    migrated.image = '';
                    migrated.imageRevision = result.revision;
                } catch (error) {
                    console.warn(
                        `[Minitiger Virtual] Bild von „${migrated.name}“ bleibt als Data-URL in der Server-Konfiguration.`,
                        error
                    );
                }
            }

            if (migrated.logo?.startsWith('data:')) {
                try {
                    const blob = await dataUrlToBlob(migrated.logo);
                    const result = await uploadMinitigerVirtualServerMedia(
                        apiClient,
                        migrated.id,
                        'logo',
                        blob,
                        'logo.png'
                    );

                    migrated.logo = '';
                    migrated.logoRevision = result.revision;
                } catch (error) {
                    console.warn(
                        `[Minitiger Virtual] Logo von „${migrated.name}“ bleibt als Data-URL in der Server-Konfiguration.`,
                        error
                    );
                }
            }

            if (migrated.videoKey) {
                const video = await getVirtualVideo(migrated.videoKey);

                if (video) {
                    const result = await uploadMinitigerVirtualServerMedia(
                        apiClient,
                        migrated.id,
                        'video',
                        video,
                        'hover.mp4'
                    );

                    migrated.videoKey = '';
                    migrated.videoRevision = result.revision;
                } else {
                    console.warn(
                        `[Minitiger Virtual] Lokales MP4 von „${migrated.name}“ ist auf diesem Client nicht mehr vorhanden und kann nicht migriert werden.`
                    );
                    migrated.videoKey = '';
                    migrated.videoRevision = 0;
                }
            }

            libraries.push(migrated);
        }

        const migratedConfig = normalizeVirtualLibraries({
            ...snapshot,
            libraries
        });

        await writeMinitigerVirtualServerConfig(
            apiClient,
            migratedConfig
        );

        return migratedConfig;
    }, [apiClient, isAdmin]);

    useEffect(() => {
        let cancelled = false;
        const localConfig = readConfig(storageKey);

        activeStorageKey.current = storageKey;
        startupLocalConfig.current = localConfig;
        serverAvailable.current = false;
        applyConfig(localConfig, storageKey);
        setSyncMessage('');

        if (!apiClient) {
            setSyncStatus('local');
            return;
        }

        setSyncStatus('loading');

        const load = async () => {
            try {
                const raw = await readMinitigerVirtualServerConfig(
                    apiClient
                );

                if (cancelled) {
                    return;
                }

                serverAvailable.current = true;
                const serverConfig = normalizeVirtualLibraries(raw);
                const serverWasNeverInitialized = Boolean(
                    raw
                    && typeof raw === 'object'
                    && (raw as Record<string, unknown>).__minitigerServerInitialized === false
                );

                if (
                    isAdmin
                    && serverWasNeverInitialized
                    && localConfig.libraries.length > 0
                ) {
                    setSyncStatus('migrating');
                    setSyncMessage(
                        'Der bisherige lokale Admin-Stand wird einmalig auf den Jellyfin-Server übertragen …'
                    );

                    try {
                        const migrated =
                            await migrateSnapshotToServer(localConfig);

                        if (cancelled) {
                            return;
                        }

                        applyConfig(migrated, storageKey);
                        setSyncStatus('server');
                        setSyncMessage(
                            'Server-Sync aktiv · der bisherige lokale Stand wurde übernommen.'
                        );
                        return;
                    } catch (error) {
                        console.warn(
                            '[Minitiger Virtual] Automatische Server-Migration fehlgeschlagen',
                            error
                        );

                        if (cancelled) {
                            return;
                        }

                        serverAvailable.current = false;
                        applyConfig(localConfig, storageKey);
                        setSyncStatus('error');
                        setSyncMessage(
                            'Der Server-Sync ist erreichbar, aber die automatische Übertragung des lokalen Stands ist fehlgeschlagen. Lokaler Fallback bleibt aktiv.'
                        );
                        return;
                    }
                }

                if (isAdmin && serverWasNeverInitialized) {
                    await writeMinitigerVirtualServerConfig(
                        apiClient,
                        localConfig
                    );

                    if (cancelled) {
                        return;
                    }

                    applyConfig(localConfig, storageKey);
                    setSyncStatus('server');
                    setSyncMessage(
                        'Server-Sync aktiv · der zentrale Speicher wurde initialisiert.'
                    );
                    return;
                }

                applyConfig(serverConfig, storageKey);
                setSyncStatus('server');
                setSyncMessage(
                    'Server-Sync aktiv · alle angemeldeten Nutzer erhalten denselben virtuellen Bibliotheks-Stand.'
                );
            } catch (error) {
                if (cancelled) {
                    return;
                }

                serverAvailable.current = false;
                applyConfig(localConfig, storageKey);

                if (error instanceof MinitigerVirtualSyncUnavailableError) {
                    setSyncStatus('local');
                    setSyncMessage(
                        'Minitiger Virtual Sync ist noch nicht installiert/erreichbar. Der bisherige lokale Client-Stand bleibt aktiv.'
                    );
                } else {
                    console.warn(
                        '[Minitiger Virtual] Server-Konfiguration konnte nicht geladen werden',
                        error
                    );
                    setSyncStatus('error');
                    setSyncMessage(
                        'Server-Sync konnte nicht geladen werden. Lokaler Cache bleibt aktiv.'
                    );
                }
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, [
        apiClient,
        applyConfig,
        isAdmin,
        migrateSnapshotToServer,
        storageKey
    ]);

    useEffect(() => {
        if (!apiClient) {
            return;
        }

        const refreshFromServer = () => {
            if (
                !serverAvailable.current
                || writeTimer.current !== undefined
            ) {
                return;
            }

            void readMinitigerVirtualServerConfig(apiClient)
                .then(raw => {
                    if (!serverAvailable.current) {
                        return;
                    }

                    applyConfig(normalizeVirtualLibraries(raw));
                    setSyncStatus('server');
                })
                .catch(error => {
                    console.warn(
                        '[Minitiger Virtual] Fokus-Sync fehlgeschlagen',
                        error
                    );
                });
        };

        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible') {
                refreshFromServer();
            }
        };

        window.addEventListener('focus', refreshFromServer);
        document.addEventListener('visibilitychange', refreshWhenVisible);

        return () => {
            window.removeEventListener('focus', refreshFromServer);
            document.removeEventListener('visibilitychange', refreshWhenVisible);
        };
    }, [apiClient, applyConfig]);

    useEffect(() => () => {
        if (writeTimer.current !== undefined) {
            window.clearTimeout(writeTimer.current);
        }
    }, []);

    const scheduleServerWrite = useCallback((
        next: MinitigerVirtualLibrariesConfig
    ) => {
        if (
            !apiClient
            || !isAdmin
            || !serverAvailable.current
        ) {
            return;
        }

        if (writeTimer.current !== undefined) {
            window.clearTimeout(writeTimer.current);
        }

        const generation = ++writeGeneration.current;

        writeTimer.current = window.setTimeout(() => {
            writeTimer.current = undefined;

            void writeMinitigerVirtualServerConfig(
                apiClient,
                next
            ).then(() => {
                if (generation !== writeGeneration.current) {
                    return;
                }

                setSyncStatus('server');
                setSyncMessage(
                    'Server-Sync aktiv · Änderungen wurden zentral gespeichert.'
                );
            }).catch(error => {
                console.warn(
                    '[Minitiger Virtual] Server-Speichern fehlgeschlagen',
                    error
                );

                if (error instanceof MinitigerVirtualSyncUnavailableError) {
                    serverAvailable.current = false;
                    setSyncStatus('local');
                    setSyncMessage(
                        'Server-Sync ist nicht mehr erreichbar. Änderungen bleiben vorerst im lokalen Cache.'
                    );
                } else {
                    setSyncStatus('error');
                    setSyncMessage(
                        'Die letzte Änderung konnte nicht zentral gespeichert werden. Lokaler Cache ist weiterhin vorhanden.'
                    );
                }
            });
        }, 350);
    }, [apiClient, isAdmin]);

    const commit = useCallback((
        producer: (
            current: MinitigerVirtualLibrariesConfig
        ) => MinitigerVirtualLibrariesConfig
    ) => {
        setConfig(current => {
            const next = normalizeVirtualLibraries(
                producer(current)
            );

            configRef.current = next;
            writeConfigCache(
                activeStorageKey.current,
                next
            );
            scheduleServerWrite(next);

            return next;
        });
    }, [scheduleServerWrite]);

    const addLibrary = useCallback(() => {
        commit(current => {
            if (current.libraries.length >= 24) {
                return current;
            }

            const id = createLibraryId();
            const position = current.libraries.length + 1;

            return {
                ...current,
                libraries: [
                    ...current.libraries,
                    {
                        id,
                        name: `Virtuelle Bibliothek ${position}`,
                        image: '',
                        logo: '',
                        videoKey: '',
                        imageRevision: 0,
                        logoRevision: 0,
                        videoRevision: 0,
                        display: 'poster',
                        enabled: true,
                        showCaption: true,
                        itemIds: []
                    }
                ],
                homeOrder: [
                    ...current.homeOrder,
                    id
                ]
            };
        });
    }, [commit]);

    const updateLibrary = useCallback((
        libraryId: string,
        patch: Partial<{
            name: string;
            image: string;
            logo: string;
            videoKey: string;
            imageRevision: number;
            logoRevision: number;
            videoRevision: number;
            display: MinitigerVirtualDisplay;
            enabled: boolean;
            showCaption: boolean;
        }>
    ) => {
        let replacedVideoKey = '';
        let replacedServerVideo = false;

        commit(current => ({
            ...current,
            libraries: current.libraries.map(library => {
                if (library.id !== libraryId) {
                    return library;
                }

                const nextPatch = { ...patch };
                const switchesToImage =
                    Boolean(patch.image)
                    || Boolean(patch.imageRevision);

                if (switchesToImage) {
                    replacedVideoKey = library.videoKey ?? '';
                    replacedServerVideo = Boolean(library.videoRevision);
                    nextPatch.videoKey = '';
                    nextPatch.videoRevision = 0;
                }

                return { ...library, ...nextPatch };
            })
        }));

        if (replacedVideoKey) {
            void deleteVirtualVideo(replacedVideoKey).catch(error => {
                console.warn(
                    '[Minitiger Virtual] Ersetztes lokales MP4 konnte nicht gelöscht werden',
                    error
                );
            });
        }

        if (
            replacedServerVideo
            && apiClient
            && isAdmin
            && serverAvailable.current
        ) {
            void deleteMinitigerVirtualServerMedia(
                apiClient,
                libraryId,
                'video'
            ).catch(error => {
                console.warn(
                    '[Minitiger Virtual] Ersetztes Server-MP4 konnte nicht gelöscht werden',
                    error
                );
            });
        }
    }, [apiClient, commit, isAdmin]);

    const removeLibrary = useCallback((libraryId: string) => {
        const existing = configRef.current.libraries.find(
            library => library.id === libraryId
        );
        const videoKey = existing?.videoKey ?? '';

        commit(current => ({
            ...current,
            libraries: current.libraries.filter(
                library => library.id !== libraryId
            ),
            homeOrder: current.homeOrder.filter(
                id => id !== libraryId
            )
        }));

        if (videoKey) {
            void deleteVirtualVideo(videoKey).catch(error => {
                console.warn(
                    '[Minitiger Virtual] Lokales MP4 konnte beim Entfernen nicht gelöscht werden',
                    error
                );
            });
        }

        if (
            apiClient
            && isAdmin
            && serverAvailable.current
        ) {
            void Promise.allSettled(
                ([ 'image', 'logo', 'video' ] as MinitigerVirtualMediaKind[])
                    .map(kind =>
                        deleteMinitigerVirtualServerMedia(
                            apiClient,
                            libraryId,
                            kind
                        )
                    )
            );
        }
    }, [apiClient, commit, isAdmin]);

    const uploadMedia = useCallback(async (
        libraryId: string,
        kind: MinitigerVirtualMediaKind,
        file: File
    ) => {
        const existing = configRef.current.libraries.find(
            library => library.id === libraryId
        );

        if (!existing) {
            throw new Error('Virtuelle Bibliothek wurde nicht gefunden.');
        }

        if (
            apiClient
            && isAdmin
            && serverAvailable.current
        ) {
            const result = await uploadMinitigerVirtualServerMedia(
                apiClient,
                libraryId,
                kind,
                file,
                file.name
            );

            if (kind === 'video') {
                if (existing.imageRevision) {
                    void deleteMinitigerVirtualServerMedia(
                        apiClient,
                        libraryId,
                        'image'
                    ).catch(() => undefined);
                }

                if (existing.videoKey) {
                    void deleteVirtualVideo(
                        existing.videoKey
                    ).catch(() => undefined);
                }

                commit(current => ({
                    ...current,
                    libraries: current.libraries.map(library =>
                        library.id === libraryId
                            ? {
                                ...library,
                                image: '',
                                imageRevision: 0,
                                videoKey: '',
                                videoRevision: result.revision
                            }
                            : library
                    )
                }));
            } else if (kind === 'image') {
                if (existing.videoRevision) {
                    void deleteMinitigerVirtualServerMedia(
                        apiClient,
                        libraryId,
                        'video'
                    ).catch(() => undefined);
                }

                if (existing.videoKey) {
                    void deleteVirtualVideo(
                        existing.videoKey
                    ).catch(() => undefined);
                }

                commit(current => ({
                    ...current,
                    libraries: current.libraries.map(library =>
                        library.id === libraryId
                            ? {
                                ...library,
                                image: '',
                                imageRevision: result.revision,
                                videoKey: '',
                                videoRevision: 0
                            }
                            : library
                    )
                }));
            } else {
                commit(current => ({
                    ...current,
                    libraries: current.libraries.map(library =>
                        library.id === libraryId
                            ? {
                                ...library,
                                logo: '',
                                logoRevision: result.revision
                            }
                            : library
                    )
                }));
            }

            return 'server' as const;
        }

        if (kind === 'video') {
            const videoKey = await putVirtualVideo(
                libraryId,
                file
            );

            updateLibrary(
                libraryId,
                {
                    videoKey,
                    videoRevision: 0,
                    image: '',
                    imageRevision: 0
                }
            );
        } else {
            const dataUrl = await readFileAsDataUrl(file);

            if (
                kind === 'image'
                && file.type === 'image/gif'
                && dataUrl.length > 1_400_000
            ) {
                throw new Error(
                    'Größere GIFs benötigen den aktiven Minitiger Virtual Sync Server-Speicher.'
                );
            }

            updateLibrary(
                libraryId,
                kind === 'image'
                    ? {
                        image: dataUrl,
                        imageRevision: 0
                    }
                    : {
                        logo: dataUrl,
                        logoRevision: 0
                    }
            );
        }

        return 'local' as const;
    }, [apiClient, commit, isAdmin, updateLibrary]);

    const removeMedia = useCallback(async (
        libraryId: string,
        kinds: MinitigerVirtualMediaKind[]
    ) => {
        const existing = configRef.current.libraries.find(
            library => library.id === libraryId
        );

        if (!existing) {
            return;
        }

        if (
            apiClient
            && isAdmin
            && serverAvailable.current
        ) {
            await Promise.allSettled(
                kinds.map(kind =>
                    deleteMinitigerVirtualServerMedia(
                        apiClient,
                        libraryId,
                        kind
                    )
                )
            );
        }

        if (kinds.includes('video') && existing.videoKey) {
            await deleteVirtualVideo(
                existing.videoKey
            ).catch(() => undefined);
        }

        const selected = new Set(kinds);

        commit(current => ({
            ...current,
            libraries: current.libraries.map(library => {
                if (library.id !== libraryId) {
                    return library;
                }

                return {
                    ...library,
                    ...(selected.has('image')
                        ? { image: '', imageRevision: 0 }
                        : {}),
                    ...(selected.has('logo')
                        ? { logo: '', logoRevision: 0 }
                        : {}),
                    ...(selected.has('video')
                        ? { videoKey: '', videoRevision: 0 }
                        : {})
                };
            })
        }));
    }, [apiClient, commit, isAdmin]);

    const pushCurrentConfigToServer = useCallback(async () => {
        if (!apiClient || !isAdmin) {
            throw new Error('Nur Administratoren können den Server-Sync initialisieren.');
        }

        setSyncStatus('migrating');
        setSyncMessage(
            'Virtuelle Bibliotheken und lokale Medien werden auf den Jellyfin-Server übertragen …'
        );

        try {
            const migrated = await migrateSnapshotToServer(
                configRef.current
            );

            serverAvailable.current = true;
            applyConfig(migrated);
            setSyncStatus('server');
            setSyncMessage(
                'Server-Sync aktiv · aktueller Stand wurde zentral gespeichert.'
            );
        } catch (error) {
            console.error(
                '[Minitiger Virtual] Manuelle Server-Migration fehlgeschlagen',
                error
            );
            setSyncStatus('error');
            setSyncMessage(
                'Übertragung auf den Server fehlgeschlagen. Prüfe, ob das Minitiger Virtual Sync Plugin installiert und Jellyfin neu gestartet wurde.'
            );
            throw error;
        }
    }, [apiClient, applyConfig, isAdmin, migrateSnapshotToServer]);

    const setItemMembership = useCallback((
        itemId: string,
        selectedLibraryIds: string[]
    ) => {
        const selected = new Set(selectedLibraryIds);

        commit(current => ({
            ...current,
            libraries: current.libraries.map(library => {
                const withoutItem = library.itemIds.filter(
                    id => id !== itemId
                );

                return {
                    ...library,
                    itemIds: selected.has(library.id)
                        ? [ ...withoutItem, itemId ]
                        : withoutItem
                };
            })
        }));
    }, [commit]);

    const updateRowTitle = useCallback((
        rowId: MinitigerVirtualRowId,
        title: string
    ) => {
        commit(current => ({
            ...current,
            rowTitles: {
                ...current.rowTitles,
                [rowId]: title
            }
        }));
    }, [commit]);

    const setRowTitleVisible = useCallback((
        rowId: MinitigerVirtualRowId,
        visible: boolean
    ) => {
        commit(current => ({
            ...current,
            rowTitleVisible: {
                ...current.rowTitleVisible,
                [rowId]: visible
            }
        }));
    }, [commit]);

    const toggleRow = useCallback((
        rowId: MinitigerVirtualRowId
    ) => {
        commit(current => ({
            ...current,
            rowEnabled: {
                ...current.rowEnabled,
                [rowId]: !current.rowEnabled[rowId]
            }
        }));
    }, [commit]);

    const setHomeCardWidth = useCallback((width: number) => {
        commit(current => ({
            ...current,
            homeCardWidth: width
        }));
    }, [commit]);

    const setHomeGap = useCallback((gap: number) => {
        commit(current => ({
            ...current,
            homeGap: gap
        }));
    }, [commit]);

    const setPagePosterWidth = useCallback((width: number) => {
        commit(current => ({
            ...current,
            pagePosterWidth: width
        }));
    }, [commit]);

    const setPageLandscapeWidth = useCallback((width: number) => {
        commit(current => ({
            ...current,
            pageLandscapeWidth: width
        }));
    }, [commit]);

    const setPageGap = useCallback((gap: number) => {
        commit(current => ({
            ...current,
            pageGap: gap
        }));
    }, [commit]);

    const moveLibrary = useCallback((
        libraryId: string,
        direction: -1 | 1
    ) => {
        commit(current => {
            const currentIndex =
                current.homeOrder.indexOf(libraryId);
            const targetIndex = currentIndex + direction;

            if (
                currentIndex < 0
                || targetIndex < 0
                || targetIndex >= current.homeOrder.length
            ) {
                return current;
            }

            const nextOrder = [ ...current.homeOrder ];
            const [ moved ] =
                nextOrder.splice(currentIndex, 1);

            nextOrder.splice(targetIndex, 0, moved);

            return {
                ...current,
                homeOrder: nextOrder
            };
        });
    }, [commit]);

    const replaceConfig = useCallback((
        value: MinitigerVirtualLibrariesConfig
    ) => {
        commit(() => normalizeVirtualLibraries(value));
    }, [commit]);

    const resetVirtualLibraries = useCallback(() => {
        commit(() => cloneDefaults());
    }, [commit]);

    return {
        config,
        syncStatus,
        syncMessage,
        addLibrary,
        updateLibrary,
        removeLibrary,
        uploadMedia,
        removeMedia,
        pushCurrentConfigToServer,
        setItemMembership,
        updateRowTitle,
        setRowTitleVisible,
        toggleRow,
        setHomeCardWidth,
        setHomeGap,
        setPagePosterWidth,
        setPageLandscapeWidth,
        setPageGap,
        moveLibrary,
        replaceConfig,
        resetVirtualLibraries
    };
};

export default useMinitigerVirtualLibraries;
