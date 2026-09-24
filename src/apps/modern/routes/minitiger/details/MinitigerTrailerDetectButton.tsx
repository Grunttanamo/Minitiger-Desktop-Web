import type { ApiClient } from 'jellyfin-apiclient';
import React, {
    useEffect,
    useRef,
    useState
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
    notifyMinitigerLocalTrailerChanged
} from '../home/components/MinitigerInlineTrailer';
import {
    detectMinitigerLocalTrailer
} from '../home/trailerDetection';

interface Props {
    apiClient?: ApiClient;
    itemId?: string | null;
}

type ResultState =
    | {
        kind: 'idle';
        label: string;
        title: string;
    }
    | {
        kind:
            | 'activated'
            | 'not_found'
            | 'incompatible'
            | 'error';
        label: string;
        title: string;
    };

const shorten = (
    value: string,
    limit = 54
) => value.length <= limit
    ? value
    : `${value.slice(0, limit - 1)}…`;

const MinitigerTrailerDetectButton = ({
    apiClient,
    itemId
}: Props) => {
    const queryClient =
        useQueryClient();

    const [ busy, setBusy ] =
        useState(false);

    const [ result, setResult ] =
        useState<ResultState>({
            kind: 'idle',
            label: 'Trailer erkennen',
            title: 'Nach trailer.mp4 oder trailer.mkv im Root-Verzeichnis suchen und als lokalen Trailer einlesen'
        });

    const resetTimer =
        useRef<number | null>(
            null
        );

    useEffect(() => () => {
        if (resetTimer.current) {
            window.clearTimeout(
                resetTimer.current
            );
        }
    }, []);

    useEffect(() => {
        setResult({
            kind: 'idle',
            label: 'Trailer erkennen',
            title: 'Nach trailer.mp4 oder trailer.mkv im Root-Verzeichnis suchen und als lokalen Trailer einlesen'
        });
    }, [itemId]);

    if (
        !apiClient
        || !itemId
    ) {
        return null;
    }

    const showTemporaryResult = (
        next: ResultState
    ) => {
        setResult(next);

        if (resetTimer.current) {
            window.clearTimeout(
                resetTimer.current
            );
        }

        resetTimer.current =
            window.setTimeout(
                () => {
                    setResult({
                        kind: 'idle',
                        label: 'Trailer erkennen',
                        title: 'Nach trailer.mp4 oder trailer.mkv im Root-Verzeichnis suchen und als lokalen Trailer einlesen'
                    });
                    resetTimer.current = null;
                },
                5_000
            );
    };

    const detect = async () => {
        if (busy) {
            return;
        }

        setBusy(true);
        setResult({
            kind: 'idle',
            label: 'Trailer erkennen …',
            title: 'Root-Verzeichnis wird geprüft …'
        });

        try {
            const detection =
                await detectMinitigerLocalTrailer(
                    apiClient,
                    itemId
                );

            if (
                detection.status
                === 'activated'
            ) {
                notifyMinitigerLocalTrailerChanged(
                    apiClient,
                    itemId
                );

                const userId =
                    apiClient.getCurrentUserId();

                if (userId) {
                    void queryClient.invalidateQueries({
                        queryKey: [
                            'User',
                            userId,
                            'Items',
                            itemId
                        ]
                    });
                }

                showTemporaryResult({
                    kind: 'activated',
                    label: '✓ Trailer eingelesen',
                    title:
                        detection.message
                        || 'Scan erfolgreich, Trailer aktiviert/eingelesen.'
                });
                return;
            }

            if (
                detection.status
                === 'not_found'
            ) {
                showTemporaryResult({
                    kind: 'not_found',
                    label: '✕ Kein Trailer gefunden',
                    title:
                        detection.message
                        || 'Scan konnte keinen Trailer finden.'
                });
                return;
            }

            const reason =
                detection.message
                || 'Unbekannter Grund';

            showTemporaryResult({
                kind: 'incompatible',
                label:
                    `⚠ Nicht kompatibel: ${
                        shorten(reason)
                    }`,
                title:
                    `Videodatei ist nicht kompatibel: ${reason}`
            });
        } catch (error) {
            const detail =
                error instanceof Error
                    ? error.message
                    : String(error);

            showTemporaryResult({
                kind: 'error',
                label:
                    `⚠ Fehler: ${
                        shorten(detail)
                    }`,
                title: detail
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type='button'
            onClick={() => {
                void detect();
            }}
            disabled={busy}
            title={result.title}
            data-trailer-detect-state={
                result.kind
            }
        >
            {result.label}
        </button>
    );
};

export default MinitigerTrailerDetectButton;
