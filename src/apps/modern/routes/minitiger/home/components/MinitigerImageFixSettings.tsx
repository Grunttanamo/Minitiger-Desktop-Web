import React, {
    useEffect,
    useMemo,
    useState
} from 'react';

import { useApi } from 'hooks/useApi';

import { getMinitigerAccessToken } from '../apiAuth';

import './MinitigerImageFixSettings.scss';

interface ImageFixSelection {
    posters: boolean;
    backdrops: boolean;
    seasonPosters: boolean;
    landscape: boolean;
    banners: boolean;
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
}

interface ImageFixStatus {
    running: boolean;
    completed: boolean;
    cancelled: boolean;
    total: number;
    processed: number;
    converted: number;
    failed: number;
    skipped: number;
    currentItem: string;
    currentCategory: string;
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
        bannerCandidates: numberValue(pick(source, 'bannerCandidates', 'BannerCandidates'))
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
        total: numberValue(pick(source, 'total', 'Total')),
        processed: numberValue(pick(source, 'processed', 'Processed')),
        converted: numberValue(pick(source, 'converted', 'Converted')),
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
            banners: false
        });
    const [ scan, setScan ] =
        useState<ImageFixScanResult | null>(null);
    const [ status, setStatus ] =
        useState<ImageFixStatus | null>(null);
    const [ busy, setBusy ] =
        useState<'scan' | 'start' | 'cancel' | ''>('');
    const [ message, setMessage ] =
        useState('');

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
        if (!selectedCount || busy || status?.running) {
            return;
        }

        setBusy('scan');
        setMessage(
            'Jellyfin-Bilder werden geprüft …'
        );

        try {
            const result =
                normalizeScan(
                    await request(
                        'Scan',
                        'POST',
                        selection
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
        ) {
            return;
        }

        const confirmed = window.confirm(
            `${scan.convertible.toLocaleString('de-DE')} Bild${scan.convertible === 1 ? '' : 'er'} jetzt nacheinander zu WebP konvertieren? Die Auflösung bleibt erhalten und die Originaldateien werden vorerst nicht gelöscht.`
        );

        if (!confirmed) {
            return;
        }

        setBusy('start');
        setMessage(
            'WebP-Konvertierung wird gestartet …'
        );

        try {
            const next =
                normalizeStatus(
                    await request(
                        'Start',
                        'POST'
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
                'Abbruch angefordert …'
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
                    if (next.cancelled) {
                        setMessage(
                            `Konvertierung abgebrochen · ${next.converted} erfolgreich.`
                        );
                    } else if (next.completed) {
                        setMessage(
                            next.failed > 0
                                ? `Fertig · ${next.converted} konvertiert · ${next.failed} fehlgeschlagen.`
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

    const candidateGroups = useMemo(() => (
        scan
            ? [
                [
                    'Poster',
                    scan.posterCandidates
                ],
                [
                    'Backdrops',
                    scan.backdropCandidates
                ],
                [
                    'Staffelposter',
                    scan.seasonPosterCandidates
                ],
                [
                    'Landscape',
                    scan.landscapeCandidates
                ],
                [
                    'Banner',
                    scan.bannerCandidates
                ]
            ] as Array<[string, number]>
            : []
    ), [scan]);

    return (
        <>
            <h3>Image Fix</h3>

            <p className='minitigerSettingsIntro'>
                Findet lokale JPG-/PNG-Metadatenbilder und konvertiert sie
                nacheinander mit Jellyfins eigenem Bild-Encoder zu WebP.
                Die Auflösung bleibt unverändert. Originaldateien werden
                in dieser ersten sicheren Version nicht gelöscht.
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
                            'Jellyfin-Thumb/Landscape-Bilder.'
                        ],
                        [
                            'banners',
                            'Banner',
                            'Jellyfin-Bannerbilder.'
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
                                disabled={Boolean(status?.running)}
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
                            || Boolean(status?.completed)
                            || Boolean(status?.cancelled)
                            || !scan?.convertible
                        }
                        onClick={() => {
                            void startConversion();
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
                            disabled={Boolean(busy)}
                            onClick={() => {
                                void cancelConversion();
                            }}
                        >
                            {busy === 'cancel'
                                ? 'Abbruch …'
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
                            geprüfte Jellyfin-Items
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

                    {status.running && status.currentItem && (
                        <div className='minitigerImageFixCurrent'>
                            <strong>{status.currentCategory}</strong>
                            <span>{status.currentItem}</span>
                        </div>
                    )}

                    {status.processed > 0 && (
                        <p className='minitigerSettingsHint'>
                            Bisherige Differenz: {status.savedBytes >= 0 ? '-' : '+'}
                            {formatBytes(Math.abs(status.savedBytes))}.
                            Ein Minus davor bedeutet kleinere WebP-Dateien.
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
        </>
    );
};

export default MinitigerImageFixSettings;

// MINITIGER_PATCH_MARKER: PHASE_IMAGE_FIX_1
