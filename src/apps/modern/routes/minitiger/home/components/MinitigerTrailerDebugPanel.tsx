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

                        <textarea
                            className='minitigerTrailerDebugOutput'
                            value={report}
                            readOnly
                            spellCheck={false}
                            aria-label='Trailer-Diagnose Ergebnis'
                        />

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
