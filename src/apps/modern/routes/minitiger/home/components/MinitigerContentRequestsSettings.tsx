import React, { useCallback, useEffect, useRef, useState } from 'react';

import { useApi } from 'hooks/useApi';

import {
    deleteMinitigerContentRequest,
    getMinitigerContentRequests,
    getOwnMinitigerContentRequests,
    updateMinitigerContentRequestStatus,
    MINITIGER_REQUEST_STATUSES,
    type MinitigerContentRequest,
    type MinitigerRequestStatus
} from '../contentRequests';

import 'apps/modern/features/minitiger/MinitigerContentRequests.scss';

// Avoid overlapping polls when the server is busy with simultaneous requests.
const REFRESH_MS = 20000;

const adminGroups: Array<{ title: string; statuses: MinitigerRequestStatus[] }> = [
    { title: 'Neue Anfragen', statuses: ['Neu'] },
    { title: 'Anfragen in Arbeit', statuses: ['In Arbeit'] },
    { title: 'Abgeschlossene Anfragen (Hinzugefügt)', statuses: ['Hinzugefügt'] },
    { title: 'Nicht gefundene Anfragen', statuses: ['Nicht gefunden'] },
    { title: 'Abgelehnte Anfragen', statuses: ['Abgelehnt'] }
];

const userGroups: Array<{ title: string; statuses: MinitigerRequestStatus[] }> = [
    { title: 'Aktuelle Anfragen', statuses: ['Neu', 'In Arbeit'] },
    { title: 'Abgeschlossene Anfragen', statuses: ['Hinzugefügt', 'Nicht gefunden'] },
    { title: 'Abgelehnte Anfragen', statuses: ['Abgelehnt'] }
];

const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? '–' : date.toLocaleString('de-DE');
};

const MinitigerContentRequestsSettings = ({ isAdmin }: { isAdmin: boolean }) => {
    const { __legacyApiClient__: apiClient } = useApi();
    const [requests, setRequests] = useState<MinitigerContentRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('');
    const [busyId, setBusyId] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<MinitigerContentRequest | null>(null);
    const fetching = useRef(false);
    const mounted = useRef(true);

    const load = useCallback(async () => {
        if (!apiClient || fetching.current) return;
        fetching.current = true;
        try {
            const items = isAdmin
                ? await getMinitigerContentRequests(apiClient)
                : await getOwnMinitigerContentRequests(apiClient);
            if (mounted.current) {
                setRequests(items);
                setStatus('');
            }
        } catch (error) {
            if (mounted.current) {
                setStatus(error instanceof Error ? error.message : String(error));
            }
        } finally {
            fetching.current = false;
            if (mounted.current) setLoading(false);
        }
    }, [apiClient, isAdmin]);

    useEffect(() => {
        mounted.current = true;
        setLoading(true);
        void load();
        const timer = window.setInterval(() => {
            if (!document.hidden) void load();
        }, REFRESH_MS);
        return () => {
            mounted.current = false;
            window.clearInterval(timer);
        };
    }, [load]);

    const updateStatus = async (request: MinitigerContentRequest, next: MinitigerRequestStatus) => {
        if (!apiClient || busyId || !isAdmin) return;
        setBusyId(request.id);
        try {
            const updated = await updateMinitigerContentRequestStatus(apiClient, request.id, next);
            setRequests(items => items.map(item => item.id === updated.id ? updated : item));
            setStatus('');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error));
        } finally {
            setBusyId('');
        }
    };

    const remove = async () => {
        if (!apiClient || !confirmDelete || busyId || !isAdmin) return;
        const item = confirmDelete;
        setBusyId(item.id);
        try {
            await deleteMinitigerContentRequest(apiClient, item.id);
            setRequests(items => items.filter(value => value.id !== item.id));
            setConfirmDelete(null);
            setStatus('');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : String(error));
        } finally {
            setBusyId('');
        }
    };

    const groups = isAdmin ? adminGroups : userGroups;

    return (
        <>
            <h3>Wünsche</h3>
            <p className='minitigerSettingsIntro'>
                {isAdmin
                    ? 'Alle Inhaltswünsche verwalten. Einträge bleiben erhalten, bis sie ausdrücklich gelöscht werden.'
                    : 'Hier findest du nur deine eigenen Inhaltswünsche und ihren aktuellen Bearbeitungsstatus.'}
            </p>
            <section className='minitigerSettingsCard'>
                <div className='minitigerContentRequestAdminTop'>
                    <div>
                        <h4>{isAdmin ? 'Wunschverwaltung' : 'Meine Wünsche'}</h4>
                        <small>{loading ? 'Wird geladen …' : requests.length + ' Anfragen'}</small>
                    </div>
                    <button type='button' onClick={() => { void load(); }} disabled={loading || Boolean(busyId)}>
                        Aktualisieren
                    </button>
                </div>
                {status && <p className='minitigerContentRequestAdminStatus' role='alert'>{status}</p>}
                <div className='minitigerContentRequestGroups'>
                    {groups.map(group => {
                        const items = requests.filter(item => group.statuses.includes(item.status));
                        return (
                            <details key={group.title} className='minitigerContentRequestGroup'>
                                <summary>
                                    <span>{group.title}</span>
                                    <strong>{items.length}</strong>
                                </summary>
                                <div className='minitigerContentRequestAdminList'>
                                    {items.map(request => (
                                        <article key={request.id} className='minitigerContentRequestAdminItem'>
                                            <div className='minitigerContentRequestAdminItemTop'>
                                                <div>
                                                    <span className='minitigerContentRequestBadge'>{request.contentType}</span>
                                                    <h4>{request.title}</h4>
                                                </div>
                                                <span className={'minitigerContentRequestStatusDot is' + MINITIGER_REQUEST_STATUSES.indexOf(request.status)} title={request.status} />
                                            </div>
                                            <div className='minitigerContentRequestMeta'>
                                                {isAdmin && <>Von <strong>{request.requesterName}</strong> · </>}
                                                {formatDate(request.createdAtUtc)} · {request.status}
                                            </div>
                                            {request.comment && <p>{request.comment}</p>}
                                            {isAdmin && (
                                                <div className='minitigerContentRequestAdminActions'>
                                                    <label>
                                                        <span>Status</span>
                                                        <select value={request.status} disabled={Boolean(busyId)}
                                                            onChange={event => { void updateStatus(request, event.currentTarget.value as MinitigerRequestStatus); }}>
                                                            {MINITIGER_REQUEST_STATUSES.map(option =>
                                                                <option key={option} value={option}>{option}</option>)}
                                                        </select>
                                                    </label>
                                                    <button type='button' disabled={Boolean(busyId)}
                                                        onClick={() => setConfirmDelete(request)}>Löschen</button>
                                                </div>
                                            )}
                                        </article>
                                    ))}
                                    {items.length === 0 && <div className='minitigerContentRequestEmpty'>Keine Wünsche in diesem Bereich.</div>}
                                </div>
                            </details>
                        );
                    })}
                </div>
            </section>
            {confirmDelete && (
                <div className='minitigerContentRequestLayer' role='presentation'
                    onMouseDown={event => { if (event.target === event.currentTarget && !busyId) setConfirmDelete(null); }}>
                    <section className='minitigerContentRequestDialog minitigerContentRequestConfirm'
                        role='dialog' aria-modal='true' aria-labelledby='minitiger-delete-request-title'>
                        <header className='minitigerContentRequestHeader'>
                            <div><small>Minitiger Wünsche</small><h2 id='minitiger-delete-request-title'>Wunsch endgültig löschen?</h2></div>
                        </header>
                        <p>„{confirmDelete.title}“ wird dauerhaft entfernt. Abgeschlossene Wünsche müssen nicht gelöscht werden.</p>
                        <div className='minitigerContentRequestActions'>
                            <button type='button' disabled={Boolean(busyId)} onClick={() => setConfirmDelete(null)}>Abbrechen</button>
                            <button type='button' className='isDanger' disabled={Boolean(busyId)}
                                onClick={() => { void remove(); }}>{busyId ? 'Wird gelöscht …' : 'Endgültig löschen'}</button>
                        </div>
                    </section>
                </div>
            )}
        </>
    );
};

export default MinitigerContentRequestsSettings;
