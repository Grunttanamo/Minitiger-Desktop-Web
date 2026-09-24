import type { ApiClient } from 'jellyfin-apiclient';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState
} from 'react';

import type { ItemDto } from 'types/base/models/item-dto';

import {
    getMinitigerAccessToken
} from '../bannerPlaylistUtils';
import {
    notifyMinitigerLocalTrailerChanged
} from './MinitigerInlineTrailer';
import {
    detectMinitigerLocalTrailer
} from '../trailerDetection';
interface Props {
    apiClient?: ApiClient;
    item?: ItemDto;
    className?: string;
}

interface TrailerDownloadStatus {
    available: boolean;
    running: boolean;
    completed: boolean;
    failed: boolean;
    cancelRequested: boolean;
    itemId?: string;
    itemName: string;
    currentStep: string;
    message: string;
    targetPath: string;
}

type ApiPath = 'Status' | 'Start' | 'Cancel';

const pick = (
    source: Record<string, unknown>,
    camel: string,
    pascal: string
) => source[camel] ?? source[pascal];

const boolValue = (value: unknown) =>
    value === true
    || value === 'true'
    || value === 1;

const stringValue = (value: unknown) =>
    typeof value === 'string'
        ? value
        : '';

const normalizeItemId = (
    value?: string | null
) => String(value ?? '')
    .replace(/-/g, '')
    .toLowerCase();

const normalizeStatus = (
    value: unknown
): TrailerDownloadStatus => {
    const source = (
        value
        && typeof value === 'object'
    )
        ? value as Record<string, unknown>
        : {};

    return {
        available: boolValue(
            pick(source, 'available', 'Available')
        ),
        running: boolValue(
            pick(source, 'running', 'Running')
        ),
        completed: boolValue(
            pick(source, 'completed', 'Completed')
        ),
        failed: boolValue(
            pick(source, 'failed', 'Failed')
        ),
        cancelRequested: boolValue(
            pick(
                source,
                'cancelRequested',
                'CancelRequested'
            )
        ),
        itemId: stringValue(
            pick(source, 'itemId', 'ItemId')
        ) || undefined,
        itemName: stringValue(
            pick(source, 'itemName', 'ItemName')
        ),
        currentStep: stringValue(
            pick(source, 'currentStep', 'CurrentStep')
        ),
        message: stringValue(
            pick(source, 'message', 'Message')
        ),
        targetPath: stringValue(
            pick(source, 'targetPath', 'TargetPath')
        )
    };
};

const isYouTubeUrl = (
    input?: string | null
) => {
    if (!input) {
        return false;
    }

    try {
        const url = new URL(input);
        const host = url.hostname
            .replace(/^www\./, '')
            .toLowerCase();

        return host === 'youtube.com'
            || host === 'm.youtube.com'
            || host === 'youtu.be';
    } catch {
        return false;
    }
};

const MinitigerTrailerDownloadButton = ({
    apiClient,
    item,
    className
}: Props) => {
    const [ active, setActive ] =
        useState(false);
    const [ status, setStatus ] =
        useState<TrailerDownloadStatus | null>(null);
    const [ busy, setBusy ] =
        useState(false);
    const [ message, setMessage ] =
        useState('');

    useEffect(() => {
        /*
         * MinitigerHero reuses the same button component while the banner
         * rotates to another item. Never carry a success/error label from
         * the previous movie/series into the new one.
         */
        setMessage('');
    }, [item?.Id]);

    const hasYouTubeTrailer = useMemo(
        () => Boolean(
            item?.RemoteTrailers
                ?.some(trailer =>
                    isYouTubeUrl(trailer.Url)
                )
        ),
        [item?.RemoteTrailers]
    );

    const apiUrl = useCallback((
        path: ApiPath
    ) => {
        if (!apiClient) {
            return '';
        }

        const token =
            getMinitigerAccessToken(apiClient);

        return apiClient.getUrl(
            `Minitiger/TrailerDownload/${path}`,
            token ? { ApiKey: token } : {}
        );
    }, [apiClient]);

    const request = useCallback(async (
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
                'Das Minitiger Companion Plugin enthält den Trailer-Download noch nicht.'
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
                // Plain-text response.
            }

            throw new Error(
                `Trailer-Download HTTP ${response.status}${
                    details ? ` · ${details}` : ''
                }`
            );
        }

        return normalizeStatus(
            await response.json()
        );
    }, [
        apiClient,
        apiUrl
    ]);

    const start = useCallback(async () => {
        if (
            !item?.Id
            || busy
            || !hasYouTubeTrailer
        ) {
            return;
        }

        setBusy(true);
        setMessage('');

        try {
            const next = await request(
                'Start',
                'POST',
                {
                    itemId: item.Id
                }
            );

            setStatus(next);
            setActive(true);
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : String(error)
            );
        } finally {
            setBusy(false);
        }
    }, [
        busy,
        hasYouTubeTrailer,
        item?.Id,
        request
    ]);

    const cancel = useCallback(async () => {
        if (!active || busy) {
            return;
        }

        setBusy(true);

        try {
            const next = await request(
                'Cancel',
                'POST'
            );

            setStatus(next);
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : String(error)
            );
        } finally {
            setBusy(false);
        }
    }, [
        active,
        busy,
        request
    ]);

    useEffect(() => {
        if (
            !active
            || !item?.Id
            || !apiClient
        ) {
            return;
        }

        let cancelled = false;
        let refreshed = false;

        const refresh = async () => {
            try {
                const next = await request(
                    'Status',
                    'GET'
                );

                if (cancelled) {
                    return;
                }

                setStatus(next);

                const sameItem = !next.itemId
                    || normalizeItemId(next.itemId)
                        === normalizeItemId(item.Id);

                if (!sameItem) {
                    if (!next.running) {
                        setActive(false);
                    }

                    return;
                }

                if (next.running) {
                    return;
                }

                if (next.completed) {
                    if (refreshed) {
                        return;
                    }

                    refreshed = true;
                    setMessage(
                        '↻ Trailer wird in Jellyfin eingelesen …'
                    );

                    try {
                        const detection =
                            await detectMinitigerLocalTrailer(
                                apiClient,
                                item.Id
                            );

                        if (cancelled) {
                            return;
                        }

                        if (
                            detection.status
                            === 'activated'
                        ) {
                            notifyMinitigerLocalTrailerChanged(
                                apiClient,
                                item.Id
                            );

                            setMessage(
                                '✓ Trailer gespeichert & eingelesen.'
                            );
                        } else if (
                            detection.status
                            === 'not_found'
                        ) {
                            setMessage(
                                '✓ Download fertig · Trailer-Datei wurde danach nicht gefunden.'
                            );
                        } else {
                            setMessage(
                                '✓ Download fertig · ' + (
                                    detection.message
                                    || 'Trailer konnte nicht aktiviert werden.'
                                )
                            );
                        }
                    } catch (error) {
                        if (!cancelled) {
                            const detail = error instanceof Error
                                ? error.message
                                : String(error);
                            setMessage(
                                '✓ Trailer gespeichert · Einlesen fehlgeschlagen: ' + detail
                            );
                        }
                    }

                    if (!cancelled) {
                        setActive(false);
                    }
                    return;
                }

                setActive(false);

                if (next.failed) {
                    setMessage(
                        next.message
                        || 'Trailer-Download fehlgeschlagen.'
                    );
                } else if (
                    next.currentStep === 'Abgebrochen'
                ) {
                    setMessage(
                        next.message
                        || 'Trailer-Download abgebrochen.'
                    );
                }
            } catch (error) {
                if (!cancelled) {
                    setActive(false);
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
            900
        );

        void refresh();

        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [
        active,
        apiClient,
        item,
        item?.Id,
        request
    ]);

    if (
        !apiClient
        || !item?.Id
        || !hasYouTubeTrailer
    ) {
        return null;
    }

    const statusMatchesThisItem = Boolean(
        status?.itemId
        && normalizeItemId(status.itemId)
            === normalizeItemId(item.Id)
    );

    const isThisItemRunning = Boolean(
        active
        && status?.running
        && statusMatchesThisItem
    );

    const isThisItemCompleted = Boolean(
        status?.completed
        && statusMatchesThisItem
    );

    const label = busy
        ? 'Trailer …'
        : isThisItemRunning
            ? status?.cancelRequested
                ? 'Abbruch …'
                : '↓ Download läuft'
            : isThisItemCompleted
                ? '✓ Trailer gespeichert'
                : '↓ Trailer speichern';

    const title = message
        || status?.currentStep
        || 'YouTube-Trailer als trailer.mp4 im Medienordner speichern';

    return (
        <button
            type='button'
            className={className}
            title={title}
            disabled={
                busy
                || Boolean(
                    status?.running
                    && !isThisItemRunning
                )
            }
            onClick={() => {
                if (isThisItemRunning) {
                    void cancel();
                } else {
                    void start();
                }
            }}
        >
            <span>{label}</span>
        </button>
    );
};

export default MinitigerTrailerDownloadButton;
