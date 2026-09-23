import React, { useState } from 'react';

import { useApi } from 'hooks/useApi';

import { getMinitigerAccessToken } from '../apiAuth';
import MinitigerConfirmDialog from './MinitigerConfirmDialog';

import './MinitigerSeasonFixSettings.scss';

interface SeasonFixChange {
    seasonId: string;
    seriesName: string;
    currentName: string;
    expectedName: string;
    indexNumber: number;
}

interface SeasonFixSkipped {
    seasonId: string;
    seriesName: string;
    currentName: string;
    reason: string;
}

interface SeasonFixScanResult {
    scannedSeasons: number;
    correctCount: number;
    skippedWithoutIndex: number;
    mismatchCount: number;
    skipped: SeasonFixSkipped[];
    changes: SeasonFixChange[];
}

interface SeasonFixApplyResult {
    requested: number;
    corrected: number;
    failed: number;
    remainingMismatchCount: number;
    scannedSeasons: number;
    skippedWithoutIndex: number;
}

const pick = (
    source: Record<string, unknown>,
    camel: string,
    pascal: string
) => source[camel] ?? source[pascal];

const normalizeChange = (
    raw: unknown
): SeasonFixChange | null => {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const source = raw as Record<string, unknown>;
    const seasonId = String(
        pick(source, 'seasonId', 'SeasonId') ?? ''
    ).trim();

    if (!seasonId) {
        return null;
    }

    return {
        seasonId,
        seriesName: String(
            pick(source, 'seriesName', 'SeriesName')
            ?? 'Unbekannte Serie'
        ),
        currentName: String(
            pick(source, 'currentName', 'CurrentName')
            ?? ''
        ),
        expectedName: String(
            pick(source, 'expectedName', 'ExpectedName')
            ?? ''
        ),
        indexNumber: Number(
            pick(source, 'indexNumber', 'IndexNumber')
            ?? 0
        )
    };
};


const normalizeSkipped = (
    raw: unknown
): SeasonFixSkipped | null => {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const source = raw as Record<string, unknown>;
    const seasonId = String(
        pick(source, 'seasonId', 'SeasonId') ?? ''
    ).trim();

    if (!seasonId) {
        return null;
    }

    return {
        seasonId,
        seriesName: String(
            pick(source, 'seriesName', 'SeriesName')
            ?? 'Unbekannte Serie'
        ),
        currentName: String(
            pick(source, 'currentName', 'CurrentName')
            ?? ''
        ),
        reason: String(
            pick(source, 'reason', 'Reason')
            ?? 'Keine gültige Staffelnummer vorhanden'
        )
    };
};

const normalizeScan = (
    raw: unknown
): SeasonFixScanResult => {
    const source =
        raw && typeof raw === 'object'
            ? raw as Record<string, unknown>
            : {};
    const changesRaw = pick(
        source,
        'changes',
        'Changes'
    );
    const skippedRaw = pick(
        source,
        'skipped',
        'Skipped'
    );

    return {
        scannedSeasons: Number(
            pick(source, 'scannedSeasons', 'ScannedSeasons')
            ?? 0
        ),
        correctCount: Number(
            pick(source, 'correctCount', 'CorrectCount')
            ?? 0
        ),
        skippedWithoutIndex: Number(
            pick(
                source,
                'skippedWithoutIndex',
                'SkippedWithoutIndex'
            ) ?? 0
        ),
        mismatchCount: Number(
            pick(source, 'mismatchCount', 'MismatchCount')
            ?? 0
        ),
        skipped: Array.isArray(skippedRaw)
            ? skippedRaw
                .map(normalizeSkipped)
                .filter(
                    (value): value is SeasonFixSkipped =>
                        Boolean(value)
                )
            : [],
        changes: Array.isArray(changesRaw)
            ? changesRaw
                .map(normalizeChange)
                .filter(
                    (value): value is SeasonFixChange =>
                        Boolean(value)
                )
            : []
    };
};

const normalizeApply = (
    raw: unknown
): SeasonFixApplyResult => {
    const source =
        raw && typeof raw === 'object'
            ? raw as Record<string, unknown>
            : {};

    return {
        requested: Number(
            pick(source, 'requested', 'Requested') ?? 0
        ),
        corrected: Number(
            pick(source, 'corrected', 'Corrected') ?? 0
        ),
        failed: Number(
            pick(source, 'failed', 'Failed') ?? 0
        ),
        remainingMismatchCount: Number(
            pick(
                source,
                'remainingMismatchCount',
                'RemainingMismatchCount'
            ) ?? 0
        ),
        scannedSeasons: Number(
            pick(source, 'scannedSeasons', 'ScannedSeasons')
            ?? 0
        ),
        skippedWithoutIndex: Number(
            pick(
                source,
                'skippedWithoutIndex',
                'SkippedWithoutIndex'
            ) ?? 0
        )
    };
};

const MinitigerSeasonFixSettings = () => {
    const {
        __legacyApiClient__: apiClient
    } = useApi();

    const [ scan, setScan ] =
        useState<SeasonFixScanResult | null>(null);
    const [ busy, setBusy ] = useState<'scan' | 'apply' | ''>('');
    const [ message, setMessage ] = useState('');
    const [ confirmOpen, setConfirmOpen ] =
        useState(false);
    const [ lastApply, setLastApply ] =
        useState<SeasonFixApplyResult | null>(null);

    const apiUrl = (
        path: 'Scan' | 'Apply'
    ) => {
        if (!apiClient) {
            return '';
        }

        const token = getMinitigerAccessToken(apiClient);

        return apiClient.getUrl(
            `Minitiger/SeasonFix/${path}`,
            token ? { ApiKey: token } : {}
        );
    };

    const request = async (
        path: 'Scan' | 'Apply',
        method: 'GET' | 'POST'
    ) => {
        if (!apiClient) {
            throw new Error('Jellyfin API ist nicht verfügbar.');
        }

        const response = await fetch(
            apiUrl(path),
            { method }
        );

        if (response.status === 404) {
            throw new Error(
                'Das Minitiger Companion Plugin enthält den Staffel Fix noch nicht.'
            );
        }

        if (!response.ok) {
            const details = await response
                .text()
                .catch(() => '');

            throw new Error(
                `Staffel Fix HTTP ${response.status}${
                    details ? ` · ${details}` : ''
                }`
            );
        }

        return await response.json() as unknown;
    };

    const runScan = async (
        quiet = false
    ) => {
        setBusy('scan');
        if (!quiet) {
            setMessage('Staffeln werden geprüft …');
        }

        try {
            const result = normalizeScan(
                await request('Scan', 'GET')
            );

            setScan(result);

            if (!quiet) {
                setMessage(
                    result.mismatchCount > 0
                        ? `${result.mismatchCount} Staffel${result.mismatchCount === 1 ? '' : 'n'} mit falscher Benennung gefunden.`
                        : 'Alles sauber ♥ Keine falsch benannten Staffeln gefunden.'
                );
            }

            return result;
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : String(error)
            );
            return null;
        } finally {
            setBusy('');
        }
    };

    const applyFix = async () => {
        if (!scan?.mismatchCount || busy) {
            return;
        }

        setConfirmOpen(false);
        setBusy('apply');
        setMessage('Staffeln werden korrigiert …');

        try {
            const result = normalizeApply(
                await request('Apply', 'POST')
            );

            setLastApply(result);
            setMessage(
                result.failed > 0
                    ? `${result.corrected} korrigiert · ${result.failed} fehlgeschlagen.`
                    : `${result.corrected} Staffel${result.corrected === 1 ? '' : 'n'} erfolgreich korrigiert. ♥`
            );

            const fresh = normalizeScan(
                await request('Scan', 'GET')
            );
            setScan(fresh);
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

    return (
        <>
            <h3>Staffel Fix</h3>

            <p className='minitigerSettingsIntro'>
                Prüft alle echten Jellyfin-Staffeln anhand ihrer Staffelnummer
                und korrigiert nur den angezeigten Metadaten-Namen. Physische
                Ordner und Dateien auf dem Server werden nicht umbenannt.
            </p>

            <section className='minitigerSettingsCard'>
                <h4>Minitiger Staffel-Regel</h4>

                <div className='minitigerSeasonFixRules'>
                    <span><strong>Season 00</strong> → Specials</span>
                    <span><strong>Season 01</strong> → Staffel 1</span>
                    <span><strong>Season 02</strong> → Staffel 2</span>
                    <span><strong>…</strong></span>
                    <span><strong>Season 12</strong> → Staffel 12</span>
                </div>

                <p className='minitigerSettingsHint'>
                    Maßgeblich ist ausschließlich Jellyfins interne
                    Staffelnummer (IndexNumber). Provider-Namen wie Arc-Titel
                    oder der Serienname werden dadurch zuverlässig erkannt.
                </p>

                <div className='minitigerBackupButtons'>
                    <button
                        type='button'
                        className='isPrimary'
                        disabled={Boolean(busy)}
                        onClick={() => {
                            void runScan();
                        }}
                    >
                        {busy === 'scan'
                            ? 'Prüfung läuft …'
                            : 'Alle Staffeln prüfen'}
                    </button>

                    <button
                        type='button'
                        disabled={
                            Boolean(busy)
                            || !scan?.mismatchCount
                        }
                        onClick={() => {
                            setConfirmOpen(true);
                        }}
                    >
                        {busy === 'apply'
                            ? 'Korrektur läuft …'
                            : scan?.mismatchCount
                                ? `${scan.mismatchCount} Korrektur${scan.mismatchCount === 1 ? '' : 'en'} anwenden`
                                : 'Korrekturen anwenden'}
                    </button>
                </div>

                {message && (
                    <p className='minitigerSettingsHint'>
                        {message}
                    </p>
                )}

                {lastApply && (
                    <div className='minitigerSeasonFixSummary isApplied'>
                        <strong>Letzter Korrekturlauf</strong>
                        <span>{lastApply.corrected} geändert</span>
                        <span>{lastApply.failed} fehlgeschlagen</span>
                        <span>{lastApply.remainingMismatchCount} noch abweichend</span>
                    </div>
                )}
            </section>

            {scan && (
                <section className='minitigerSettingsCard'>
                    <h4>Prüfergebnis</h4>

                    <div className='minitigerSeasonFixSummary'>
                        <span>
                            <strong>{scan.scannedSeasons}</strong>
                            geprüft
                        </span>
                        <span>
                            <strong>{scan.correctCount}</strong>
                            bereits korrekt
                        </span>
                        <span>
                            <strong>{scan.mismatchCount}</strong>
                            zu korrigieren
                        </span>
                        <span>
                            <strong>{scan.skippedWithoutIndex}</strong>
                            ohne Staffelnummer übersprungen
                        </span>
                    </div>

                    {scan.changes.length > 0 ? (
                        <div className='minitigerSeasonFixList'>
                            {scan.changes.map(change => (
                                <article
                                    key={change.seasonId}
                                    className='minitigerSeasonFixItem'
                                >
                                    <strong>{change.seriesName}</strong>
                                    <div>
                                        <span title={change.currentName}>
                                            {change.currentName || '(leer)'}
                                        </span>
                                        <b aria-hidden='true'>→</b>
                                        <span className='isExpected'>
                                            {change.expectedName}
                                        </span>
                                    </div>
                                    <small>
                                        IndexNumber: {change.indexNumber}
                                    </small>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className='minitigerSeasonFixClean'>
                            ✓ {scan.skipped.length > 0
                                ? 'Alle prüfbaren Staffeln entsprechen der gewünschten Benennung.'
                                : 'Alle Staffeln entsprechen der gewünschten Benennung.'}
                        </div>
                    )}

                    {scan.skipped.length > 0 && (
                        <div className='minitigerSeasonFixSkippedSection'>
                            <div className='minitigerSeasonFixSkippedHead'>
                                <strong>Übersprungene Staffeln</strong>
                                <span>{scan.skipped.length}</span>
                            </div>

                            <p className='minitigerSettingsHint'>
                                Diese Staffeln wurden nicht verändert, weil Jellyfin
                                keine verwendbare Staffelnummer (IndexNumber) liefert.
                            </p>

                            <div className='minitigerSeasonFixSkippedList'>
                                {scan.skipped.map(item => (
                                    <article
                                        key={item.seasonId}
                                        className='minitigerSeasonFixSkippedItem'
                                    >
                                        <strong>{item.seriesName}</strong>
                                        <span title={item.currentName}>
                                            {item.currentName || '(Staffelname leer)'}
                                        </span>
                                        <small>{item.reason}</small>
                                    </article>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            )}

            <MinitigerConfirmDialog
                open={confirmOpen}
                title='Staffel-Korrekturen anwenden?'
                confirmLabel='Korrekturen anwenden'
                busy={busy === 'apply'}
                onCancel={() => setConfirmOpen(false)}
                onConfirm={() => {
                    void applyFix();
                }}
            >
                <p>
                    <strong>{scan?.mismatchCount ?? 0}</strong>{' '}
                    Staffel{scan?.mismatchCount === 1 ? '' : 'n'} werden nach der
                    Minitiger-Regel umbenannt.
                </p>

                <div className='minitigerConfirmNotice'>
                    Es werden nur Jellyfins angezeigte Metadaten-Namen geändert.
                    Physische Ordner und Dateien bleiben unangetastet.
                </div>
            </MinitigerConfirmDialog>
        </>
    );
};

export default MinitigerSeasonFixSettings;

// MINITIGER_PATCH_MARKER: PHASE_18_21_0_SEASON_FIX_UI
// MINITIGER_PATCH_MARKER: PHASE_18_21_1_SEASON_FIX_SKIPPED_DETAILS_UI
