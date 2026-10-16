import type { ApiClient } from 'jellyfin-apiclient';
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { ItemDto } from 'types/base/models/item-dto';

import {
    notifyMinitigerLocalTrailerChanged,
    runMinitigerTrailerDiagnostic
} from './MinitigerInlineTrailer';
import {
    detectMinitigerLocalTrailer
} from '../trailerDetection';

interface Props {
    apiClient?: ApiClient;
    item?: ItemDto;
    onOpenChange?: (open: boolean) => void;
}

const copyText = async (text: string) => {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Desktop shells can deny Clipboard API. Fall through.
        }
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-10000px';
        textarea.style.top = '-10000px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        return copied;
    } catch {
        return false;
    }
};

// A concise reading for nontechnical users; the complete raw report stays
// available below and can be copied without losing any troubleshooting data.
const summarizeTrailerReport = (report: string, running: boolean) => {
    if (running) return { title: 'Diagnose läuft', message: 'Minitiger prüft gerade die Trailerquelle und den Playerstatus.', color: '#e7b326' };
    if (!report) return { title: 'Noch keine Diagnose', message: 'Starte einen Test, um den aktuellen Trailer zu prüfen.', color: '#aaaaaa' };
    if (/DIAGNOSE FEHLGESCHLAGEN|TRAILER-NEUEINLESEN FEHLGESCHLAGEN/.test(report)) {
        return { title: 'Fehler bei der Diagnose', message: 'Die Messung konnte nicht abgeschlossen werden. Die technischen Details stehen unten.', color: '#ff7777' };
    }
    if (/Lokale Trailer erkannt: 0|keinen lokalen Trailer/.test(report)) {
        return { title: 'Kein lokaler Trailer', message: 'Jellyfin liefert für diesen Titel keinen lokalen Trailer. Nutze gegebenenfalls „Trailer neu einlesen“.', color: '#ffbf5e' };
    }
    if (/previewPaused=yes|previewSuspended=true/.test(report)) {
        return { title: 'Trailer pausiert', message: 'Der native VLC-Player ist aktuell pausiert. Prüfe, ob der Trailer sichtbar ist und ob ein Scrollereignis die Pause ausgelöst hat.', color: '#ffbf5e' };
    }
    const first = report.match(/firstFrameMs=(-?\d+)/);
    const fps = report.match(/decoderCallbackFpsApprox=([\d.]+)/);
    const visible = report.match(/previewVisible=(yes|no)/);
    if (first && Number(first[1]) < 0) {
        return { title: 'Warte auf Videobild', message: 'Der VLC-Player ist gestartet, aber es wurde bislang noch kein erstes Bild gemeldet.', color: '#ffbf5e' };
    }
    if (first && Number(first[1]) > 3000) {
        return { title: 'Langsamer Trailerstart', message: `Das erste Videobild kam erst nach ${(Number(first[1]) / 1000).toFixed(1)} Sekunden. Ein Initialisierungsproblem ist möglich.`, color: '#ffbf5e' };
    }
    if (fps && Number(fps[1]) > 0 && Number(fps[1]) < 12 && visible?.[1] === 'yes') {
        return { title: 'Niedrige Decoder-Bildrate', message: `VLC meldet derzeit nur ungefähr ${fps[1]} decodierte Bilder pro Sekunde. Das ist nicht die tatsächliche Bildschirm-FPS-Zahl.`, color: '#ffbf5e' };
    }
    if (/Video frame received: yes/.test(report)) {
        return { title: 'Trailerbilder werden empfangen', message: 'VLC meldet Videobilder. Ob die Anzeige wirklich flüssig ist, kann diese Messung allein nicht bestätigen. Bitte zusätzlich auf Ruckler und Layoutfehler achten.', color: '#83d5a0' };
    }
    return { title: 'Diagnose vorhanden', message: 'Die erfassten Rohdaten stehen unten. Noch kein eindeutiger Wiedergabestatus ableitbar.', color: '#aaaaaa' };
};

const MinitigerTrailerDebugPanel = ({
    apiClient,
    item,
    onOpenChange
}: Props) => {
    const [ open, setOpen ] = useState(false);
    const [ running, setRunning ] = useState(false);
    const [ refreshing, setRefreshing ] = useState(false);
    const [ report, setReport ] = useState('');
    const [ copyState, setCopyState ] = useState('Kopieren');
    const [ showDetails, setShowDetails ] = useState(false);
    const summary = summarizeTrailerReport(report, running || refreshing);

    const run = useCallback(async () => {
        if (!apiClient || !item) {
            return;
        }

        setRunning(true);
        setCopyState('Kopieren');
        setReport(
            `Diagnose läuft für „${item.Name ?? item.Id ?? 'unbekannt'}“ …\n\nBitte bis zum Ende warten. Die Wiedergabe-Probe kann ca. 30 Sekunden dauern.`
        );

        try {
            const result = await runMinitigerTrailerDiagnostic(
                apiClient,
                item
            );
            setReport(result);
        } catch (error) {
            setReport(
                `DIAGNOSE FEHLGESCHLAGEN\n${error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)}`
            );
        } finally {
            setRunning(false);
        }
    }, [ apiClient, item ]);

    useEffect(() => {
        if (!open || report || running) {
            return;
        }

        void run();
    }, [ open, report, run, running ]);

    useEffect(() => {
        /* A changed banner item should never show the previous title's
           report as if it belonged to the new item. */
        setReport('');
        setCopyState('Kopieren');
    }, [ item?.Id ]);

    const copy = useCallback(async () => {
        if (!report) {
            return;
        }

        const copied = await copyText(report);
        setCopyState(copied ? 'Kopiert ✓' : 'Markieren + Strg+C');
    }, [ report ]);

    const refreshTrailerRegistration = useCallback(async () => {
        if (!apiClient || !item) {
            return;
        }

        setRefreshing(true);
        setCopyState('Kopieren');
        setReport(
            `Minitiger prüft das Root-Verzeichnis von „${item.Name ?? item.Id ?? 'unbekannt'}“ auf trailer.mp4 / trailer.mkv …

Es wird KEIN Jellyfin-Metadaten- oder Bilder-Refresh gestartet.`
        );

        try {
            if (!item.Id) {
                throw new Error(
                    'Das Item besitzt keine Jellyfin-ID.'
                );
            }

            const detection =
                await detectMinitigerLocalTrailer(
                    apiClient,
                    item.Id
                );

            if (
                detection.status
                === 'activated'
            ) {
                notifyMinitigerLocalTrailerChanged(
                    apiClient,
                    item.Id
                );

                setReport(
                    `Trailer-Erkennung erfolgreich.

${detection.message}

Starte Diagnose …`
                );

                const result =
                    await runMinitigerTrailerDiagnostic(
                        apiClient,
                        item
                    );
                setReport(result);
            } else {
                setReport(
                    `Trailer-Erkennung: ${detection.status}

${detection.message}`
                );
            }
        } catch (error) {
            setReport(
                `TRAILER-NEUEINLESEN FEHLGESCHLAGEN
${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`
            );
        } finally {
            setRefreshing(false);
        }
    }, [ apiClient, item ]);

    return (
        <>
            <button
                type='button'
                className='minitigerHeroButton minitigerTrailerDebugButton'
                onClick={() => {
                    setOpen(true);
                    onOpenChange?.(true);
                }}
                title='Lokalen Trailer im Browser/Desktop Client diagnostizieren'
            >
                <span aria-hidden='true'>🧪</span>
                <span>Trailer-Debug</span>
            </button>

            {open && typeof document !== 'undefined' && createPortal(
                <div
                    className='minitigerTrailerDebugBackdrop'
                    role='presentation'
                    onMouseDown={event => {
                        if (event.currentTarget === event.target) {
                            setOpen(false);
                            onOpenChange?.(false);
                        }
                    }}
                >
                    <section
                        className='minitigerTrailerDebugPanel'
                        role='dialog'
                        aria-modal='true'
                        aria-label='Minitiger Trailer Diagnose'
                    >
                        <header className='minitigerTrailerDebugHeader'>
                            <div>
                                <strong>🧪 Trailer-Diagnose</strong>
                                <span>{item?.Name ?? 'Kein Banner-Item'}</span>
                            </div>

                            <button
                                type='button'
                                className='minitigerTrailerDebugClose'
                                onClick={() => {
                                    setOpen(false);
                                    onOpenChange?.(false);
                                }}
                                aria-label='Trailer-Diagnose schließen'
                            >
                                ×
                            </button>
                        </header>

                        <p className='minitigerTrailerDebugHint'>
                            Der Test nutzt exakt dieselben lokalen Quellen wie die Banner-Vorschau. Zugangstokens werden vor der Anzeige automatisch entfernt.
                        </p>

                        <div style={{ background: '#191b20', borderLeft: `4px solid ${summary.color}`, padding: '14px 16px', borderRadius: 8, marginBottom: 12 }} role='status'>
                            <strong style={{ color: summary.color, display: 'block', marginBottom: 8 }}>Einfach erklärt: {summary.title}</strong>
                            <p style={{ margin: 0, lineHeight: 1.5 }}>{summary.message}</p>
                            <p style={{ opacity: 0.75, fontSize: '0.85em', margin: '8px 0 0' }}>Hinweis: Ein grüner Playerstatus bestätigt noch keine störungsfreie Darstellung. Fade-, Scroll- und Vorschaukartenfehler bleiben separat zu prüfen.</p>
                        </div>
                        <button type='button' className='minitigerHeroButton' onClick={() => setShowDetails(value => !value)} aria-expanded={showDetails} style={{ marginBottom: 10 }}>
                            {showDetails ? '▾ Technische Details ausblenden' : '▸ Technische Details für Fehlersuche anzeigen'}
                        </button>
                        {showDetails && <textarea
                            className='minitigerTrailerDebugOutput'
                            value={report}
                            readOnly
                            spellCheck={false}
                            aria-label='Trailer-Diagnose technische Details'
                        />}

                        <footer className='minitigerTrailerDebugActions'>
                            <button
                                type='button'
                                className='minitigerHeroButton'
                                onClick={() => void run()}
                                disabled={running || refreshing || !apiClient || !item}
                            >
                                {running ? 'Test läuft …' : 'Erneut testen'}
                            </button>

                            <button
                                type='button'
                                className='minitigerHeroButton'
                                onClick={() => void refreshTrailerRegistration()}
                                disabled={running || refreshing || !apiClient || !item}
                                title='Nur dieses Item neu einlesen; Bild-Refresh bleibt deaktiviert'
                            >
                                {refreshing ? 'Lese neu ein …' : '↻ Trailer neu einlesen'}
                            </button>

                            <button
                                type='button'
                                className='minitigerHeroButton minitigerHeroPlay'
                                onClick={() => void copy()}
                                disabled={!report || running || refreshing}
                            >
                                {copyState}
                            </button>
                        </footer>
                    </section>
                </div>,
                document.body
            )}
        </>
    );
};

export default MinitigerTrailerDebugPanel;
