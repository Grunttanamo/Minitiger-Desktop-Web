import React, {
    useEffect,
    useMemo,
    useState
} from 'react';

import { useApi } from 'hooks/useApi';

import { getMinitigerAccessToken } from '../apiAuth';
import MinitigerConfirmDialog from './MinitigerConfirmDialog';

import './MinitigerImageFixSettings.scss';

interface ImageFixSelection {
    posters: boolean;
    backdrops: boolean;
    seasonPosters: boolean;
    landscape: boolean;
    banners: boolean;
    people: boolean;
}

interface ImageFixScanResult {
    scannedItems: number;
    selectedImages: number;
    alreadyWebp: number;
    jpg: number;
    png: number;
    otherFormats: number;
    remoteSkipped: number;
    missingSkipped: number;
    targetExistsSkipped: number;
    convertible: number;
    convertibleBytes: number;
    posterCandidates: number;
    backdropCandidates: number;
    seasonPosterCandidates: number;
    landscapeCandidates: number;
    bannerCandidates: number;
    peopleCandidates: number;
}

interface ImageFixStatus {
    running: boolean;
    completed: boolean;
    cancelled: boolean;
    cancelRequested: boolean;
    needsServerRestart: boolean;
    timedOut: boolean;
    deleteOriginals: boolean;
    total: number;
    processed: number;
    converted: number;
    deletedOriginals: number;
    protectedOriginals: number;
    deleteFailures: number;
    failed: number;
    skipped: number;
    currentItem: string;
    currentCategory: string;
    currentStep: string;
    currentPath: string;
    currentStartedAtUtc: string;
    lastProgressAtUtc: string;
    backgroundEncodes: number;
    sourceBytes: number;
    outputBytes: number;
    savedBytes: number;
    errors: string[];
}

type ApiPath =
    | 'Scan'
    | 'Start'
    | 'Status'
    | 'Cancel';

const pick = (
    source: Record<string, unknown>,
    camel: string,
    pascal: string
) => source[camel] ?? source[pascal];

const numberValue = (
    value: unknown
) => (
    Number.isFinite(Number(value))
        ? Number(value)
        : 0
);

const normalizeScan = (
    value: unknown
): ImageFixScanResult => {
    const source =
        value && typeof value === 'object'
            ? value as Record<string, unknown>
            : {};

    return {
        scannedItems: numberValue(pick(source, 'scannedItems', 'ScannedItems')),
        selectedImages: numberValue(pick(source, 'selectedImages', 'SelectedImages')),
        alreadyWebp: numberValue(pick(source, 'alreadyWebp', 'AlreadyWebp')),
        jpg: numberValue(pick(source, 'jpg', 'Jpg')),
        png: numberValue(pick(source, 'png', 'Png')),
        otherFormats: numberValue(pick(source, 'otherFormats', 'OtherFormats')),
        remoteSkipped: numberValue(pick(source, 'remoteSkipped', 'RemoteSkipped')),
        missingSkipped: numberValue(pick(source, 'missingSkipped', 'MissingSkipped')),
        targetExistsSkipped: numberValue(pick(source, 'targetExistsSkipped', 'TargetExistsSkipped')),
        convertible: numberValue(pick(source, 'convertible', 'Convertible')),
        convertibleBytes: numberValue(pick(source, 'convertibleBytes', 'ConvertibleBytes')),
        posterCandidates: numberValue(pick(source, 'posterCandidates', 'PosterCandidates')),
        backdropCandidates: numberValue(pick(source, 'backdropCandidates', 'BackdropCandidates')),
        seasonPosterCandidates: numberValue(pick(source, 'seasonPosterCandidates', 'SeasonPosterCandidates')),
        landscapeCandidates: numberValue(pick(source, 'landscapeCandidates', 'LandscapeCandidates')),
        bannerCandidates: numberValue(pick(source, 'bannerCandidates', 'BannerCandidates')),
        peopleCandidates: numberValue(pick(source, 'peopleCandidates', 'PeopleCandidates'))
    };
};

const normalizeStatus = (
    value: unknown
): ImageFixStatus => {
    const source =
        value && typeof value === 'object'
            ? value as Record<string, unknown>
            : {};

    return {
        running: pick(source, 'running', 'Running') === true,
        completed: pick(source, 'completed', 'Completed') === true,
        cancelled: pick(source, 'cancelled', 'Cancelled') === true,
        cancelRequested: pick(source, 'cancelRequested', 'CancelRequested') === true,
        needsServerRestart: pick(source, 'needsServerRestart', 'NeedsServerRestart') === true,
        timedOut: pick(source, 'timedOut', 'TimedOut') === true,
        deleteOriginals: pick(source, 'deleteOriginals', 'DeleteOriginals') === true,
        total: numberValue(pick(source, 'total', 'Total')),
        processed: numberValue(pick(source, 'processed', 'Processed')),
        converted: numberValue(pick(source, 'converted', 'Converted')),
        deletedOriginals: numberValue(pick(source, 'deletedOriginals', 'DeletedOriginals')),
        protectedOriginals: numberValue(pick(source, 'protectedOriginals', 'ProtectedOriginals')),
        deleteFailures: numberValue(pick(source, 'deleteFailures', 'DeleteFailures')),
        failed: numberValue(pick(source, 'failed', 'Failed')),
        skipped: numberValue(pick(source, 'skipped', 'Skipped')),
        currentItem:
            typeof pick(source, 'currentItem', 'CurrentItem') === 'string'
                ? String(pick(source, 'currentItem', 'CurrentItem'))
                : '',
        currentCategory:
            typeof pick(source, 'currentCategory', 'CurrentCategory') === 'string'
                ? String(pick(source, 'currentCategory', 'CurrentCategory'))
                : '',
        currentStep:
            typeof pick(source, 'currentStep', 'CurrentStep') === 'string'
                ? String(pick(source, 'currentStep', 'CurrentStep'))
                : '',
        currentPath:
            typeof pick(source, 'currentPath', 'CurrentPath') === 'string'
                ? String(pick(source, 'currentPath', 'CurrentPath'))
                : '',
        currentStartedAtUtc:
            typeof pick(source, 'currentStartedAtUtc', 'CurrentStartedAtUtc') === 'string'
                ? String(pick(source, 'currentStartedAtUtc', 'CurrentStartedAtUtc'))
                : '',
        lastProgressAtUtc:
            typeof pick(source, 'lastProgressAtUtc', 'LastProgressAtUtc') === 'string'
                ? String(pick(source, 'lastProgressAtUtc', 'LastProgressAtUtc'))
                : '',
        backgroundEncodes:
            numberValue(
                pick(source, 'backgroundEncodes', 'BackgroundEncodes')
            ),
        sourceBytes: numberValue(pick(source, 'sourceBytes', 'SourceBytes')),
        outputBytes: numberValue(pick(source, 'outputBytes', 'OutputBytes')),
        savedBytes: numberValue(pick(source, 'savedBytes', 'SavedBytes')),
        errors: Array.isArray(
            pick(source, 'errors', 'Errors')
        )
            ? (
                pick(source, 'errors', 'Errors') as unknown[]
            ).filter(
                (entry): entry is string =>
                    typeof entry === 'string'
            )
            : []
    };
};

const formatBytes = (
    bytes: number
) => {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0 B';
    }

    const units = [
        'B',
        'KB',
        'MB',
        'GB',
        'TB'
    ];

    let value = bytes;
    let unit = 0;

    while (
        value >= 1024
        && unit < units.length - 1
    ) {
        value /= 1024;
        unit++;
    }

    return `${value.toLocaleString(
        'de-DE',
        {
            maximumFractionDigits:
                unit === 0 ? 0 : 1
        }
    )} ${units[unit]}`;
};

const MinitigerImageFixSettings = () => {
    const {
        __legacyApiClient__: apiClient
    } = useApi();

    const [ selection, setSelection ] =
        useState<ImageFixSelection>({
            posters: true,
            backdrops: false,
            seasonPosters: false,
            landscape: false,
            banners: false,
            people: false
        });
    const [ scan, setScan ] =
        useState<ImageFixScanResult | null>(null);
    const [ status, setStatus ] =
        useState<ImageFixStatus | null>(null);
    const [ busy, setBusy ] =
        useState<'scan' | 'start' | 'cancel' | ''>('');
    const [ message, setMessage ] =
        useState('');
    const [ deleteOriginals, setDeleteOriginals ] =
        useState(false);
    const [ confirmOpen, setConfirmOpen ] =
        useState(false);

    const selectedCount =
        Object.values(selection)
            .filter(Boolean)
            .length;

    const apiUrl = (
        path: ApiPath
    ) => {
        if (!apiClient) {
            return '';
        }

        const token =
            getMinitigerAccessToken(apiClient);

        return apiClient.getUrl(
            `Minitiger/ImageFix/${path}`,
            token ? { ApiKey: token } : {}
        );
    };

    const request = async (
        path: ApiPath,
        method: 'GET' | 'POST',
        body?: unknown
    ) => {
        if (!apiClient) {
            throw new Error(
                'Jellyfin API ist nicht verfügbar.'
            );
        }

        const response = await fetch(
            apiUrl(path),
            {
                method,
                headers: body
                    ? {
                        'Content-Type':
                            'application/json'
                    }
                    : undefined,
                body: body
                    ? JSON.stringify(body)
                    : undefined
            }
        );

        if (response.status === 404) {
            throw new Error(
                'Das Minitiger Companion Plugin enthält den Image Fix noch nicht.'
            );
        }

        if (!response.ok) {
            const raw = await response
                .text()
                .catch(() => '');

            let details = raw;

            try {
                const parsed =
                    JSON.parse(raw) as {
                        message?: unknown;
                    };

                if (
                    typeof parsed.message
                    === 'string'
                ) {
                    details = parsed.message;
                }
            } catch {
                // Plain-text server response.
            }

            throw new Error(
                `Image Fix HTTP ${response.status}${
                    details ? ` · ${details}` : ''
                }`
            );
        }

        return await response.json() as unknown;
    };

    const updateSelection = (
        key: keyof ImageFixSelection,
        checked: boolean
    ) => {
        setSelection(current => ({
            ...current,
            [key]: checked
        }));
        setScan(null);
        setStatus(null);
        setMessage('');
    };

    const runScan = async () => {
        if (
            !selectedCount
            || busy
            || status?.running
            || status?.needsServerRestart
        ) {
            return;
        }

        setBusy('scan');
        setMessage(
            deleteOriginals
                ? 'Jellyfin-Bilder werden geprüft · inklusive Sicherheitsprüfung für gemeinsam verwendete Originaldateien …'
                : 'Jellyfin-Bilder werden geprüft …'
        );

        try {
            const result =
                normalizeScan(
                    await request(
                        'Scan',
                        'POST',
                        {
                            ...selection,
                            deleteOriginals
                        }
                    )
                );

            setScan(result);
            setStatus(null);
            setMessage(
                result.convertible > 0
                    ? `${result.convertible.toLocaleString('de-DE')} Bild${result.convertible === 1 ? '' : 'er'} können zu WebP konvertiert werden.`
                    : 'Für die aktuelle Auswahl gibt es nichts zu konvertieren. ♥'
            );
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : String(error)
            );
        } finally {
            setBusy('');
        }
    };

    const startConversion = async () => {
        if (
            !scan?.convertible
            || busy
            || status?.running
            || status?.needsServerRestart
        ) {
            return;
        }

        setConfirmOpen(false);
        setBusy('start');
        setMessage(
            'WebP-Konvertierung wird gestartet …'
        );

        try {
            const next =
                normalizeStatus(
                    await request(
                        'Start',
                        'POST',
                        {
                            deleteOriginals
                        }
                    )
                );

            setStatus(next);
            setMessage(
                'Konvertierung läuft Bild für Bild …'
            );
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : String(error)
            );
        } finally {
            setBusy('');
        }
    };

    const cancelConversion = async () => {
        if (!status?.running || busy) {
            return;
        }

        setBusy('cancel');

        try {
            const next =
                normalizeStatus(
                    await request(
                        'Cancel',
                        'POST'
                    )
                );

            setStatus(next);
            setMessage(
                next.needsServerRestart
                    ? 'Abbruch angefordert. Ein Encoder läuft noch im Hintergrund – Jellyfin bitte einmal neu starten.'
                    : 'Abbruch angefordert …'
            );
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : String(error)
            );
        } finally {
            setBusy('');
        }
    };

    useEffect(() => {
        if (!apiClient) {
            return;
        }

        let cancelled = false;

        const restoreServerStatus = async () => {
            try {
                const next =
                    normalizeStatus(
                        await request(
                            'Status',
                            'GET'
                        )
                    );

                if (cancelled) {
                    return;
                }

                if (
                    next.running
                    || next.needsServerRestart
                    || next.processed > 0
                ) {
                    setStatus(next);

                    if (next.running) {
                        setMessage(
                            'Laufender Image-Fix-Job vom Jellyfin-Server wurde wieder verbunden. ♥'
                        );
                    } else if (next.needsServerRestart) {
                        setMessage(
                            'Der vorherige Image-Fix hat einen hängenden Encoder erkannt. Bitte Jellyfin einmal neu starten.'
                        );
                    }
                }
            } catch {
                // A missing/old endpoint is handled when the user actively uses Image Fix.
            }
        };

        void restoreServerStatus();

        return () => {
            cancelled = true;
        };
        // apiClient changes when the active Jellyfin server changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiClient]);

    useEffect(() => {
        if (!status?.running) {
            return;
        }

        let cancelled = false;

        const refresh = async () => {
            try {
                const next =
                    normalizeStatus(
                        await request(
                            'Status',
                            'GET'
                        )
                    );

                if (cancelled) {
                    return;
                }

                setStatus(next);

                if (!next.running) {
                    if (next.needsServerRestart) {
                        setMessage(
                            next.timedOut
                                ? 'Ein Bild hat den 2-Minuten-Watchdog ausgelöst. Jellyfin bitte einmal neu starten; die Problemdatei steht unten.'
                                : 'Die Konvertierung wurde beendet, aber ein Encoder-Task läuft noch im Hintergrund. Jellyfin bitte einmal neu starten.'
                        );
                    } else if (next.cancelled) {
                        setMessage(
                            `Konvertierung abgebrochen · ${next.converted} erfolgreich.`
                        );
                    } else if (next.completed) {
                        setMessage(
                            next.failed > 0
                                ? `Fertig · ${next.converted} konvertiert · ${next.failed} fehlgeschlagen.`
                                : next.deleteOriginals
                                    ? `Fertig ♥ ${next.converted} konvertiert · ${next.deletedOriginals} Originale gelöscht.`
                                    : `Fertig ♥ ${next.converted} Bilder wurden erfolgreich zu WebP konvertiert.`
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
            }
        };

        const timer = window.setInterval(
            () => {
                void refresh();
            },
            850
        );

        void refresh();

        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [
        apiClient,
        status?.running
    ]);

    const progress =
        status?.total
            ? Math.min(
                100,
                Math.round(
                    status.processed
                    / status.total
                    * 100
                )
            )
            : 0;

    const candidateGroups = useMemo(() => {
        if (!scan) {
            return [];
        }

        const groups: Array<[
            keyof ImageFixSelection,
            string,
            number
        ]> = [
            [
                'posters',
                'Poster',
                scan.posterCandidates
            ],
            [
                'backdrops',
                'Backdrops',
                scan.backdropCandidates
            ],
            [
                'seasonPosters',
                'Staffelposter',
                scan.seasonPosterCandidates
            ],
            [
                'landscape',
                'Landscape',
                scan.landscapeCandidates
            ],
            [
                'banners',
                'Banner',
                scan.bannerCandidates
            ],
            [
                'people',
                'Cast / Personen',
                scan.peopleCandidates
            ]
        ];

        return groups
            .filter(([ key ]) => selection[key])
            .map(([, label, count ]) => [
                label,
                count
            ] as [string, number]);
    }, [
        scan,
        selection
    ]);

    return (
        <>
            <h3>Image Fix</h3>

            <p className='minitigerSettingsIntro'>
                Findet lokale JPG-/PNG-Metadatenbilder und konvertiert sie
                nacheinander mit Jellyfins eigenem Bild-Encoder zu WebP.
                Die Auflösung bleibt unverändert. Optional können die alten
                JPG-/PNG-Dateien erst nach erfolgreicher WebP-Aktivierung gelöscht werden.
            </p>

            <section className='minitigerSettingsCard'>
                <h4>Bildtypen auswählen</h4>

                <div className='minitigerImageFixTypes'>
                    {([
                        [
                            'posters',
                            'Poster',
                            'Primäre Poster, ausgenommen Staffelposter.'
                        ],
                        [
                            'backdrops',
                            'Backdrops',
                            'Hintergrundbilder inklusive weiterer Backdrops.'
                        ],
                        [
                            'seasonPosters',
                            'Staffelposter',
                            'Primäre Bilder von Jellyfin-Staffeln.'
                        ],
                        [
                            'landscape',
                            'Landscape',
                            'Jellyfin-Thumb/Landscape-Bilder inklusive Episodenbilder.'
                        ],
                        [
                            'banners',
                            'Banner',
                            'Jellyfin-Bannerbilder.'
                        ],
                        [
                            'people',
                            'Cast / Personenbilder',
                            'Primäre Bilder von Schauspielern und anderen Jellyfin-Personen.'
                        ]
                    ] as Array<[
                        keyof ImageFixSelection,
                        string,
                        string
                    ]>).map(([
                        key,
                        label,
                        description
                    ]) => (
                        <label
                            key={key}
                            className='minitigerSettingsToggle'
                        >
                            <input
                                type='checkbox'
                                checked={selection[key]}
                                disabled={
                            Boolean(status?.running)
                            || Boolean(status?.needsServerRestart)
                        }
                                onChange={event =>
                                    updateSelection(
                                        key,
                                        event.currentTarget.checked
                                    )
                                }
                            />
                            <span>
                                <strong>{label}</strong>
                                <small>{description}</small>
                            </span>
                        </label>
                    ))}
                </div>

                <label className='minitigerImageFixDeleteToggle'>
                    <input
                        type='checkbox'
                        checked={deleteOriginals}
                        disabled={
                            Boolean(status?.running)
                            || Boolean(status?.needsServerRestart)
                        }
                        onChange={event => {
                            setDeleteOriginals(
                                event.currentTarget.checked
                            );
                            setScan(null);
                            setStatus(null);
                            setMessage('');
                        }}
                    />
                    <span>
                        <strong>
                            Originaldateien nach erfolgreicher Konvertierung löschen
                        </strong>
                        <small>
                            JPG/PNG wird erst gelöscht, nachdem WebP erzeugt, validiert und als aktives Jellyfin-Bild gespeichert wurde.
                        </small>
                    </span>
                </label>

                <p className='minitigerSettingsHint'>
                    Unterstützte Quellen für die Konvertierung: JPG/JPEG und
                    PNG. Bereits vorhandene WebP-Dateien werden nur gezählt.
                    Remote-Bilder, fehlende Dateien und bereits vorhandene
                    gleichnamige WebP-Ziele werden sicher übersprungen.
                </p>

                <div className='minitigerBackupButtons'>
                    <button
                        type='button'
                        className='isPrimary'
                        disabled={
                            Boolean(busy)
                            || Boolean(status?.running)
                            || Boolean(status?.needsServerRestart)
                            || selectedCount === 0
                        }
                        onClick={() => {
                            void runScan();
                        }}
                    >
                        {busy === 'scan'
                            ? 'Scan läuft …'
                            : 'Auswahl scannen'}
                    </button>

                    <button
                        type='button'
                        disabled={
                            Boolean(busy)
                            || Boolean(status?.running)
                            || Boolean(status?.needsServerRestart)
                            || Boolean(status?.completed)
                            || Boolean(status?.cancelled)
                            || !scan?.convertible
                        }
                        onClick={() => {
                            setConfirmOpen(true);
                        }}
                    >
                        {busy === 'start'
                            ? 'Startet …'
                            : scan?.convertible
                                ? `${scan.convertible.toLocaleString('de-DE')} zu WebP konvertieren`
                                : 'Konvertieren'}
                    </button>

                    {status?.running && (
                        <button
                            type='button'
                            disabled={
                                Boolean(busy)
                                || Boolean(status.cancelRequested)
                            }
                            onClick={() => {
                                void cancelConversion();
                            }}
                        >
                            {busy === 'cancel'
                                ? 'Abbruch …'
                                : status.cancelRequested
                                    ? 'Abbruch angefordert …'
                                    : 'Abbrechen'}
                        </button>
                    )}
                </div>

                {message && (
                    <p className='minitigerSettingsHint'>
                        {message}
                    </p>
                )}
            </section>

            {scan && (
                <section className='minitigerSettingsCard'>
                    <h4>Scan-Ergebnis</h4>

                    <div className='minitigerImageFixSummary'>
                        <span>
                            <strong>{scan.scannedItems.toLocaleString('de-DE')}</strong>
                            geprüfte relevante Jellyfin-Items
                        </span>
                        <span>
                            <strong>{scan.selectedImages.toLocaleString('de-DE')}</strong>
                            ausgewählte Bilder
                        </span>
                        <span>
                            <strong>{scan.alreadyWebp.toLocaleString('de-DE')}</strong>
                            bereits WebP
                        </span>
                        <span>
                            <strong>{scan.jpg.toLocaleString('de-DE')}</strong>
                            JPG/JPEG
                        </span>
                        <span>
                            <strong>{scan.png.toLocaleString('de-DE')}</strong>
                            PNG
                        </span>
                        <span className='isConvertible'>
                            <strong>{scan.convertible.toLocaleString('de-DE')}</strong>
                            konvertierbar
                        </span>
                        <span>
                            <strong>{formatBytes(scan.convertibleBytes)}</strong>
                            Quelldaten
                        </span>
                    </div>

                    <div className='minitigerImageFixBreakdown'>
                        {candidateGroups.map(([
                            label,
                            count
                        ]) => (
                            <span key={label}>
                                <b>{label}</b>
                                {count.toLocaleString('de-DE')}
                            </span>
                        ))}
                    </div>

                    <p className='minitigerSettingsHint'>
                        Übersprungen: {scan.otherFormats.toLocaleString('de-DE')} andere Formate ·{' '}
                        {scan.remoteSkipped.toLocaleString('de-DE')} Remote-Bilder ·{' '}
                        {scan.missingSkipped.toLocaleString('de-DE')} fehlende Dateien ·{' '}
                        {scan.targetExistsSkipped.toLocaleString('de-DE')} vorhandenes WebP-Ziel.
                    </p>
                </section>
            )}

            {status?.needsServerRestart && (
                <section className='minitigerSettingsCard minitigerImageFixRestartWarning'>
                    <h4>Jellyfin-Neustart erforderlich</h4>
                    <p>
                        Jellyfins Bild-Encoder hat auf ein Bild nicht mehr reagiert oder
                        lief beim Abbruch noch im Hintergrund. Minitiger blockiert deshalb
                        bewusst einen neuen Scan und eine neue Konvertierung, damit nicht
                        zwei Encoder-Läufe gleichzeitig auf dieselben Metadaten zugreifen.
                    </p>
                    {status.currentPath && (
                        <code>{status.currentPath}</code>
                    )}
                </section>
            )}

            {status && (
                <section className='minitigerSettingsCard'>
                    <h4>Konvertierung</h4>

                    <div className='minitigerImageFixProgress'>
                        <div>
                            <span
                                style={{
                                    width: `${progress}%`
                                }}
                            />
                        </div>
                        <strong>{progress}%</strong>
                    </div>

                    <div className='minitigerImageFixSummary'>
                        <span>
                            <strong>{status.processed.toLocaleString('de-DE')} / {status.total.toLocaleString('de-DE')}</strong>
                            verarbeitet
                        </span>
                        <span className='isConvertible'>
                            <strong>{status.converted.toLocaleString('de-DE')}</strong>
                            konvertiert
                        </span>
                        <span>
                            <strong>{status.skipped.toLocaleString('de-DE')}</strong>
                            übersprungen
                        </span>
                        {status.deleteOriginals && (
                            <span>
                                <strong>{status.deletedOriginals.toLocaleString('de-DE')}</strong>
                                Originale gelöscht
                            </span>
                        )}
                        {status.deleteOriginals && (
                            <span>
                                <strong>{status.protectedOriginals.toLocaleString('de-DE')}</strong>
                                gemeinsam genutzt · behalten
                            </span>
                        )}
                        {status.deleteOriginals && (
                            <span>
                                <strong>{status.deleteFailures.toLocaleString('de-DE')}</strong>
                                Löschfehler
                            </span>
                        )}
                        <span>
                            <strong>{status.failed.toLocaleString('de-DE')}</strong>
                            Fehler
                        </span>
                        <span>
                            <strong>{formatBytes(status.sourceBytes)}</strong>
                            Quelle
                        </span>
                        <span>
                            <strong>{formatBytes(status.outputBytes)}</strong>
                            WebP
                        </span>
                    </div>

                    {(status.running || status.needsServerRestart)
                        && status.currentItem && (
                        <div className='minitigerImageFixCurrent'>
                            <strong>
                                {status.currentCategory}
                                {status.currentStep
                                    ? ` · ${status.currentStep}`
                                    : ''}
                            </strong>
                            <span>{status.currentItem}</span>
                            {status.currentPath && (
                                <code>{status.currentPath}</code>
                            )}
                            {status.backgroundEncodes > 0 && (
                                <small>
                                    {status.backgroundEncodes} Encoder-Task
                                    {status.backgroundEncodes === 1 ? '' : 's'} noch aktiv
                                </small>
                            )}
                        </div>
                    )}

                    {status.processed > 0 && (
                        <p className='minitigerSettingsHint'>
                            Kompressionsdifferenz der erfolgreich konvertierten Bilder: {status.savedBytes >= 0 ? '-' : '+'}
                            {formatBytes(Math.abs(status.savedBytes))}.
                            Ein Minus bedeutet kleinere WebP-Dateien.
                        </p>
                    )}

                    {status.errors.length > 0 && (
                        <div className='minitigerImageFixErrors'>
                            <strong>Letzte Fehler</strong>
                            {status.errors.map((
                                error,
                                index
                            ) => (
                                <small
                                    key={`${index}-${error}`}
                                >
                                    {error}
                                </small>
                            ))}
                        </div>
                    )}
                </section>
            )}

            <MinitigerConfirmDialog
                open={confirmOpen}
                title='WebP-Konvertierung starten?'
                confirmLabel={
                    deleteOriginals
                        ? 'Konvertieren & Originale löschen'
                        : 'Konvertierung starten'
                }
                danger={deleteOriginals}
                busy={busy === 'start'}
                onCancel={() => setConfirmOpen(false)}
                onConfirm={() => {
                    void startConversion();
                }}
            >
                <p>
                    Es werden <strong>{scan?.convertible.toLocaleString('de-DE') ?? 0}</strong>{' '}
                    Bild{scan?.convertible === 1 ? '' : 'er'} nacheinander zu WebP konvertiert.
                    Die Auflösung bleibt erhalten.
                </p>

                <div className='minitigerConfirmNotice'>
                    {deleteOriginals ? (
                        <>
                            <strong>Originale löschen ist aktiviert.</strong>{' '}
                            Eine JPG-/PNG-Datei wird erst entfernt, nachdem das neue
                            WebP validiert und von Jellyfin erfolgreich übernommen wurde.
                            Dateien, die von mehreren Jellyfin-Bildern gemeinsam genutzt
                            werden, bleiben aus Sicherheitsgründen erhalten.
                        </>
                    ) : (
                        <>
                            <strong>Sicherheitsmodus.</strong>{' '}
                            Die ursprünglichen JPG-/PNG-Dateien bleiben erhalten.
                        </>
                    )}
                </div>
            </MinitigerConfirmDialog>
        </>
    );
};

export default MinitigerImageFixSettings;

// MINITIGER_PATCH_MARKER: PHASE_IMAGE_FIX_1
// MINITIGER_PATCH_MARKER: PHASE_IMAGE_FIX_FINAL
// MINITIGER_PATCH_MARKER: PHASE_IMAGE_FIX_WATCHDOG
