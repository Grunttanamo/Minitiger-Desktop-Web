import React, {
    useEffect,
    useMemo,
    useState
} from 'react';

import { useApi } from 'hooks/useApi';

import {
    getMinitigerDirectoryUpdateLibraries,
    getMinitigerLibraryPrefixScanStatus,
    startMinitigerLibraryPrefixScan,
    type MinitigerDirectoryUpdateLibrary,
    type MinitigerLibraryPrefixScanStatus
} from '../directoryUpdate';

import './MinitigerLibraryPrefixScanSettings.scss';

const PREFIXES = [
    '0-9',
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
];

const EMPTY_STATUS: MinitigerLibraryPrefixScanStatus = {
    status: 'idle',
    running: false,
    completed: false,
    libraryId: '',
    libraryName: '',
    prefix: '',
    total: 0,
    processed: 0,
    newItems: 0,
    currentItem: '',
    message: '',
    foundItems: [],
    errors: []
};

const MinitigerLibraryPrefixScanSettings = () => {
    const {
        __legacyApiClient__: apiClient
    } = useApi();

    const [ libraries, setLibraries ] =
        useState<MinitigerDirectoryUpdateLibrary[]>([]);
    const [ libraryId, setLibraryId ] =
        useState('');
    const [ prefix, setPrefix ] =
        useState('A');
    const [ status, setStatus ] =
        useState<MinitigerLibraryPrefixScanStatus>(
            EMPTY_STATUS
        );
    const [ loading, setLoading ] =
        useState(false);
    const [ message, setMessage ] =
        useState('');

    const selectedLibrary =
        useMemo(
            () => libraries.find(
                library =>
                    library.id === libraryId
            ),
            [
                libraries,
                libraryId
            ]
        );

    useEffect(() => {
        if (!apiClient) {
            setLibraries([]);
            setLibraryId('');
            return;
        }

        let cancelled = false;

        const load = async () => {
            setLoading(true);

            try {
                const next =
                    await getMinitigerDirectoryUpdateLibraries(
                        apiClient
                    );

                if (cancelled) {
                    return;
                }

                setLibraries(next);
                setLibraryId(current =>
                    current
                    && next.some(
                        library =>
                            library.id === current
                    )
                        ? current
                        : next[0]?.id ?? ''
                );

                const serverStatus =
                    await getMinitigerLibraryPrefixScanStatus(
                        apiClient
                    );

                if (!cancelled) {
                    setStatus(serverStatus);

                    if (
                        serverStatus.running
                        || serverStatus.completed
                    ) {
                        setMessage(
                            serverStatus.message
                        );
                    }
                }
            } catch (error) {
                if (!cancelled) {
                    setMessage(
                        error instanceof Error
                            ? error.message
                            : String(error)
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void load();

        return () => {
            cancelled = true;
        };
    }, [apiClient]);

    useEffect(() => {
        if (
            !apiClient
            || !status.running
        ) {
            return;
        }

        let cancelled = false;

        const refresh = async () => {
            try {
                const next =
                    await getMinitigerLibraryPrefixScanStatus(
                        apiClient
                    );

                if (cancelled) {
                    return;
                }

                setStatus(next);
                setMessage(
                    next.message
                );
            } catch (error) {
                if (!cancelled) {
                    setMessage(
                        error instanceof Error
                            ? error.message
                            : String(error)
                    );
                }
            }
        };

        const timer =
            window.setInterval(
                () => {
                    void refresh();
                },
                750
            );

        void refresh();

        return () => {
            cancelled = true;
            window.clearInterval(
                timer
            );
        };
    }, [
        apiClient,
        status.running
    ]);

    const start = async () => {
        if (
            !apiClient
            || !libraryId
            || status.running
        ) {
            return;
        }

        setMessage(
            'Teilscan wird gestartet …'
        );

        try {
            const next =
                await startMinitigerLibraryPrefixScan(
                    apiClient,
                    libraryId,
                    prefix
                );

            setStatus(next);
            setMessage(
                next.message
            );
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : String(error)
            );
        }
    };

    const progress =
        status.total > 0
            ? Math.min(
                100,
                Math.round(
                    status.processed
                    / status.total
                    * 100
                )
            )
            : 0;

    return (
        <section className='minitigerSettingsCard minitigerPrefixScanSettings'>
            <h4>Gezielter Bibliotheks-Scan</h4>

            <p className='minitigerSettingsHint'>
                Prüft nur Root-Inhalte der ausgewählten Medien-Bibliothek,
                deren Name mit dem gewählten Buchstaben beginnt. So lässt
                sich z. B. ausschließlich der Bereich „S“ neu einlesen,
                ohne die komplette Bibliothek zu scannen.
            </p>

            <div className='minitigerPrefixScanControls'>
                <label className='minitigerSettingsField'>
                    <span>Media-Bibliothek</span>
                    <select
                        value={libraryId}
                        disabled={
                            loading
                            || status.running
                        }
                        onChange={event =>
                            setLibraryId(
                                event.currentTarget.value
                            )
                        }
                    >
                        {libraries.length === 0 && (
                            <option value=''>
                                Keine Bibliothek verfügbar
                            </option>
                        )}

                        {libraries.map(library => (
                            <option
                                key={library.id}
                                value={library.id}
                            >
                                {library.name}
                                {library.collectionType
                                    ? ` · ${library.collectionType}`
                                    : ''}
                            </option>
                        ))}
                    </select>
                </label>

                <label className='minitigerSettingsField'>
                    <span>Anfang</span>
                    <select
                        value={prefix}
                        disabled={status.running}
                        onChange={event =>
                            setPrefix(
                                event.currentTarget.value
                            )
                        }
                    >
                        {PREFIXES.map(value => (
                            <option
                                key={value}
                                value={value}
                            >
                                {value}
                            </option>
                        ))}
                    </select>
                </label>

                <button
                    type='button'
                    className='minitigerPrefixScanStart'
                    disabled={
                        loading
                        || !libraryId
                        || status.running
                    }
                    onClick={() => {
                        void start();
                    }}
                >
                    {status.running
                        ? '↻ Teilscan läuft …'
                        : 'Teilscan starten'}
                </button>
            </div>

            {selectedLibrary
                && selectedLibrary.locations.length > 0
                && (
                    <small className='minitigerPrefixScanLocation'>
                        Root: {selectedLibrary.locations.join(' · ')}
                    </small>
                )}

            {(message || status.running || status.completed) && (
                <div className='minitigerPrefixScanStatus'>
                    <div className='minitigerPrefixScanStatusHeader'>
                        <strong>
                            {status.running
                                ? 'Scan läuft'
                                : status.completed
                                    ? 'Letzter Scan'
                                    : 'Status'}
                        </strong>

                        {status.total > 0 && (
                            <span>
                                {status.processed.toLocaleString('de-DE')}
                                {' / '}
                                {status.total.toLocaleString('de-DE')}
                                {' geprüft · '}
                                {status.newItems.toLocaleString('de-DE')}
                                {' neu'}
                            </span>
                        )}
                    </div>

                    {status.total > 0 && (
                        <progress
                            max={100}
                            value={progress}
                        />
                    )}

                    {status.currentItem && (
                        <small>
                            Aktuell: {status.currentItem}
                        </small>
                    )}

                    {message && (
                        <p>{message}</p>
                    )}
                </div>
            )}

            {status.foundItems.length > 0 && (
                <div className='minitigerPrefixScanResults'>
                    <strong>Neu gefunden</strong>

                    <ul>
                        {status.foundItems.map(
                            (item, index) => (
                                <li
                                    key={`${item.path}-${index}`}
                                    title={item.path}
                                >
                                    {item.summary}
                                </li>
                            )
                        )}
                    </ul>
                </div>
            )}

            {status.errors.length > 0 && (
                <div className='minitigerPrefixScanErrors'>
                    <strong>
                        Fehler / nicht scannbar
                    </strong>

                    <ul>
                        {status.errors.map(
                            (error, index) => (
                                <li
                                    key={`${error}-${index}`}
                                >
                                    {error}
                                </li>
                            )
                        )}
                    </ul>
                </div>
            )}
        </section>
    );
};

export default MinitigerLibraryPrefixScanSettings;
