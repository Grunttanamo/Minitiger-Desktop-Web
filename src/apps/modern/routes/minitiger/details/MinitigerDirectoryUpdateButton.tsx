import type { ApiClient } from 'jellyfin-apiclient';
import React, {
    useEffect,
    useRef,
    useState
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
    runMinitigerDirectoryUpdate
} from '../home/directoryUpdate';

interface Props {
    apiClient?: ApiClient;
    itemId?: string | null;
}

const MinitigerDirectoryUpdateButton = ({
    apiClient,
    itemId
}: Props) => {
    const queryClient =
        useQueryClient();

    const [ busy, setBusy ] =
        useState(false);

    const [ label, setLabel ] =
        useState('Verzeichnis Update');

    const [ title, setTitle ] =
        useState(
            'Root-Verzeichnis dieses Inhalts gezielt nach neuen Dateien, Unterordnern, Metadaten und Bildern durchsuchen'
        );

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
        setBusy(false);
        setLabel('Verzeichnis Update');
        setTitle(
            'Root-Verzeichnis dieses Inhalts gezielt nach neuen Dateien, Unterordnern, Metadaten und Bildern durchsuchen'
        );
    }, [ itemId ]);

    if (
        !apiClient
        || !itemId
    ) {
        return null;
    }

    const resetLater = () => {
        if (resetTimer.current) {
            window.clearTimeout(
                resetTimer.current
            );
        }

        resetTimer.current =
            window.setTimeout(
                () => {
                    setLabel(
                        'Verzeichnis Update'
                    );
                    setTitle(
                        'Root-Verzeichnis dieses Inhalts gezielt nach neuen Dateien, Unterordnern, Metadaten und Bildern durchsuchen'
                    );
                    resetTimer.current = null;
                },
                6_000
            );
    };

    const run = async () => {
        if (busy) {
            return;
        }

        setBusy(true);
        setLabel('↻ Verzeichnis Update …');
        setTitle(
            'Jellyfin prüft nur das zugehörige Root-Verzeichnis und dessen Unterordner.'
        );

        try {
            const result =
                await runMinitigerDirectoryUpdate(
                    apiClient,
                    itemId
                );

            if (
                result.status
                === 'updated'
            ) {
                setLabel(
                    '✓ Verzeichnis aktualisiert'
                );
                setTitle(
                    result.message
                );

                await queryClient.invalidateQueries({
                    predicate: query => {
                        const key =
                            query.queryKey;

                        if (
                            key.includes(itemId)
                        ) {
                            return true;
                        }

                        if (
                            key[0] === 'Items'
                            && key[1]
                            && typeof key[1] === 'object'
                        ) {
                            const options =
                                key[1] as {
                                    parentId?: unknown;
                                };

                            return options.parentId
                                === itemId;
                        }

                        return false;
                    }
                });
            } else if (
                result.status
                === 'busy'
            ) {
                setLabel(
                    '⏳ Update läuft bereits'
                );
                setTitle(
                    result.message
                );
            } else {
                setLabel(
                    '⚠ Update nicht möglich'
                );
                setTitle(
                    result.message
                );
            }
        } catch (error) {
            const detail =
                error instanceof Error
                    ? error.message
                    : String(error);

            setLabel(
                '⚠ Update fehlgeschlagen'
            );
            setTitle(detail);
        } finally {
            setBusy(false);
            resetLater();
        }
    };

    return (
        <button
            type='button'
            onClick={() => {
                void run();
            }}
            disabled={busy}
            title={title}
        >
            {label}
        </button>
    );
};

export default MinitigerDirectoryUpdateButton;
