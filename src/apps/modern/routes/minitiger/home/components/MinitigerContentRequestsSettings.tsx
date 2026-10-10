import React, { useEffect, useState } from 'react';

import { useApi } from 'hooks/useApi';

import {
    deleteMinitigerContentRequest,
    getMinitigerContentRequests,
    type MinitigerContentRequest
} from '../contentRequests';

import 'apps/modern/features/minitiger/MinitigerContentRequests.scss';

const REFRESH_MS = 5000;

const formatDate = (value: string) => {
    if (!value) {
        return '–';
    }

    try {
        return new Date(value).toLocaleString('de-DE');
    } catch {
        return value;
    }
};

const MinitigerContentRequestsSettings = () => {
    const {
        __legacyApiClient__: apiClient
    } = useApi();

    const [ requests, setRequests ] =
        useState<MinitigerContentRequest[]>([]);
    const [ loading, setLoading ] = useState(true);
    const [ status, setStatus ] = useState('');

    const load = async () => {
        if (!apiClient) {
            setRequests([]);
            return;
        }

        setRequests(
            await getMinitigerContentRequests(apiClient)
        );
    };

    useEffect(() => {
        if (!apiClient) {
            setLoading(false);
            return;
        }

        let active = true;

        const initialLoad = async () => {
            setLoading(true);

            try {
                await load();

                if (active) {
                    setStatus('');
                }
            } catch (error) {
                if (active) {
                    setStatus(
                        error instanceof Error
                            ? error.message
                            : String(error)
                    );
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };

        void initialLoad();

        const timer = window.setInterval(
            () => {
                void load().catch(error => {
                    console.warn(
                        '[Minitiger ContentRequests] Anfragen konnten nicht aktualisiert werden.',
                        error
                    );
                });
            },
            REFRESH_MS
        );

        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [apiClient]);

    const remove = async (
        request: MinitigerContentRequest
    ) => {
        if (!apiClient) {
            return;
        }

        if (
            !window.confirm(
                `Anfrage „${request.title}“ wirklich entfernen?`
            )
        ) {
            return;
        }

        try {
            await deleteMinitigerContentRequest(
                apiClient,
                request.id
            );
            setRequests(current =>
                current.filter(value =>
                    value.id !== request.id
                )
            );
            setStatus('');
        } catch (error) {
            setStatus(
                error instanceof Error
                    ? error.message
                    : String(error)
            );
        }
    };

    return (
        <>
            <h3>Anfragen</h3>
            <p className='minitigerSettingsIntro'>
                Inhaltswünsche deiner Minitiger-Nutzer. Neue Wünsche erscheinen automatisch.
            </p>

            <section className='minitigerSettingsCard'>
                <div className='minitigerContentRequestAdminTop'>
                    <div>
                        <h4>Inhaltsanfragen</h4>
                        <small>
                            {loading
                                ? 'Wird geladen …'
                                : `${requests.length} Anfrage${requests.length === 1 ? '' : 'n'}`}
                        </small>
                    </div>

                    <button
                        type='button'
                        onClick={() => {
                            setLoading(true);
                            void load()
                                .then(() => setStatus(''))
                                .catch(error =>
                                    setStatus(
                                        error instanceof Error
                                            ? error.message
                                            : String(error)
                                    )
                                )
                                .finally(() =>
                                    setLoading(false)
                                );
                        }}
                        disabled={loading}
                    >
                        Aktualisieren
                    </button>
                </div>

                {status && (
                    <p className='minitigerContentRequestAdminStatus'>
                        {status}
                    </p>
                )}

                <div className='minitigerContentRequestAdminList'>
                    {requests.map(request => (
                        <article
                            key={request.id}
                            className='minitigerContentRequestAdminItem'
                        >
                            <div className='minitigerContentRequestAdminItemTop'>
                                <div>
                                    <span className='minitigerContentRequestBadge'>
                                        {request.contentType}
                                    </span>
                                    <h4>{request.title}</h4>
                                </div>

                                <button
                                    type='button'
                                    onClick={() => {
                                        void remove(request);
                                    }}
                                >
                                    Entfernen
                                </button>
                            </div>

                            <div className='minitigerContentRequestMeta'>
                                Von <strong>{request.requesterName}</strong>
                                {' · '}
                                {formatDate(request.createdAtUtc)}
                            </div>

                            {request.comment && (
                                <p>{request.comment}</p>
                            )}
                        </article>
                    ))}

                    {!loading && requests.length === 0 && (
                        <div className='minitigerContentRequestEmpty'>
                            Aktuell gibt es keine Inhaltsanfragen. ♥
                        </div>
                    )}
                </div>
            </section>
        </>
    );
};

export default MinitigerContentRequestsSettings;

// MINITIGER_PATCH_MARKER: CONTENT_REQUEST_ADMIN_SETTINGS_V1
