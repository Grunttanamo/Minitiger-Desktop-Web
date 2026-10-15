import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { playbackManager } from 'components/playback/playbackmanager';
import { useApi } from 'hooks/useApi';
import {
    SOLO_QUEUE_CHANGED, activeSoloQueueProfileId, clearSoloQueue, moveSoloQueueItem,
    readSoloQueue, removeSoloQueueItem, type SoloQueueEntry
} from './soloQueue';

import MinitigerConfirmDialog from 'apps/modern/routes/minitiger/home/components/MinitigerConfirmDialog';
import './MinitigerFloatingQueue.scss';

const MinitigerFloatingQueue = () => {
    const { __legacyApiClient__: apiClient } = useApi();
    const location = useLocation();
    const [entries, setEntries] = useState<SoloQueueEntry[]>([]);
    const [open, setOpen] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        const refresh = () => {
            if (!apiClient) { setEntries([]); return; }
            setEntries(readSoloQueue(apiClient, activeSoloQueueProfileId(apiClient)));
        };
        refresh();
        window.addEventListener(SOLO_QUEUE_CHANGED, refresh);
        window.addEventListener('minitiger:profile-switched', refresh);
        return () => {
            window.removeEventListener(SOLO_QUEUE_CHANGED, refresh);
            window.removeEventListener('minitiger:profile-switched', refresh);
        };
    }, [apiClient, location.pathname]);

    useEffect(() => {
        const update = () => setPlaying(Boolean(playbackManager.getCurrentPlayer()));
        update();
        // Player can start through the popout or other UI; observe both events
        // and fall back to a low-frequency check during navigation.
        const id = window.setInterval(update, 1200);
        return () => window.clearInterval(id);
    }, []);

    if (!apiClient || !entries.length || playing) return null;
    const profile = activeSoloQueueProfileId(apiClient);
    const reorder = (from: number, to: number) => moveSoloQueueItem(apiClient, profile, from, to);
    const start = async () => {
        const first = entries[0];
        if (!first) return;
        try {
            let item = await apiClient.getItem(apiClient.getCurrentUserId(), first.itemId);
            if (first.itemType === 'Season' || first.itemType === 'Series') {
                const result = await apiClient.getItems(apiClient.getCurrentUserId(), {
                    ParentId: first.itemId,
                    Recursive: first.itemType === 'Series',
                    IncludeItemTypes: 'Episode',
                    IsMissing: false,
                    Limit: 1000,
                    EnableTotalRecordCount: false
                });
                const episodes = (result.Items || []).filter(x => x.Id && x.LocationType !== 'Virtual' && x.LocationType !== 'Offline')
                    .sort((a, b) => (a.ParentIndexNumber ?? 9999) - (b.ParentIndexNumber ?? 9999)
                        || (a.IndexNumber ?? 9999) - (b.IndexNumber ?? 9999));
                item = episodes.find(x => !x.UserData?.Played) || episodes[0];
            }
            if (!item?.Id) return;
            // Remove before the potentially long-lived native player promise.
            removeSoloQueueItem(apiClient, profile, first.id);
            setOpen(false);
            void playbackManager.play({ items: [item], startPositionTicks: 0 }).catch(error => {
                console.warn('[Minitiger Queue] Start fehlgeschlagen', error);
            });
        } catch (error) {
            console.warn('[Minitiger Queue] Eintrag konnte nicht geladen werden', error);
        }
    };

    return <div className='minitigerFloatingQueue'>
        <MinitigerConfirmDialog open={confirmClear} title='Warteschlange leeren?'
            confirmLabel='Alles entfernen' cancelLabel='Behalten' danger
            onCancel={() => setConfirmClear(false)}
            onConfirm={() => { clearSoloQueue(apiClient, profile); setConfirmClear(false); setOpen(false); }}>
            Alle Einträge deiner persönlichen Warteschlange entfernen? Das lässt sich nicht rückgängig machen.
        </MinitigerConfirmDialog>
        {open && <section className='minitigerFloatingQueuePanel' aria-label='Meine Warteschlange'>
            <header><strong>Meine Warteschlange ({entries.length})</strong>
                <button type='button' aria-label='Schließen' onClick={() => setOpen(false)}>×</button></header>
            <div className='minitigerFloatingQueueItems'>
                {entries.map((entry, index) => <article key={entry.id}>
                    <img src={apiClient.getUrl('Items/' + encodeURIComponent(entry.itemId) + '/Images/Primary', { maxWidth: 130 })} alt='' />
                    <div><strong>{entry.seriesTitle || entry.title}</strong>
                        <small>{entry.itemType === 'Episode'
                            ? `Staffel ${entry.seasonNumber ?? '?'} · Folge ${entry.episodeNumber ?? '?'}`
                            : entry.itemType === 'Season' ? 'Staffel' : entry.itemType === 'Series' ? 'Serie' : 'Film'}</small></div>
                    <div className='minitigerFloatingQueueActions'>
                        <button type='button' disabled={index === 0} title='Nach oben' onClick={() => reorder(index, index - 1)}>↑</button>
                        <button type='button' disabled={index === entries.length - 1} title='Nach unten' onClick={() => reorder(index, index + 1)}>↓</button>
                        <button type='button' title='Entfernen' onClick={() => removeSoloQueueItem(apiClient, profile, entry.id)}>×</button>
                    </div>
                </article>)}
            </div>
            <footer>
                <button type='button' onClick={() => void start()}>▶ Warteschlange starten</button>
                <button type='button' onClick={() => setConfirmClear(true)}>Liste leeren</button>
            </footer>
        </section>}
        <button type='button' className='minitigerFloatingQueueToggle'
            title='Warteschlange öffnen' aria-label='Warteschlange öffnen'
            aria-expanded={open} onClick={() => setOpen(!open)}>
            <span aria-hidden='true'>☷</span><span className='minitigerFloatingQueueCount'>{entries.length}</span>
        </button>
    </div>;
};

export default MinitigerFloatingQueue;
