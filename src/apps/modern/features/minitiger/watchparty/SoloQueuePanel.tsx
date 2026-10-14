import type { ApiClient } from 'jellyfin-apiclient';
import React, { useEffect, useState } from 'react';
import {
    SOLO_QUEUE_CHANGED,
    activeSoloQueueProfileId,
    clearSoloQueue,
    moveSoloQueueItem,
    readSoloQueue,
    removeSoloQueueItem,
    type SoloQueueEntry
} from './soloQueue';

interface Props {
    apiClient: ApiClient;
}

const SoloQueuePanel = ({ apiClient }: Props) => {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<SoloQueueEntry[]>([]);
    const profileId = activeSoloQueueProfileId(apiClient);
    useEffect(() => {
        const refresh = () => setItems(readSoloQueue(apiClient, activeSoloQueueProfileId(apiClient)));
        refresh();
        window.addEventListener(SOLO_QUEUE_CHANGED, refresh);
        return () => window.removeEventListener(SOLO_QUEUE_CHANGED, refresh);
    }, [apiClient]);
    const rerender = () => setItems(readSoloQueue(apiClient, profileId));

    return (
        <section className='minitigerSoloQueuePanel'>
            <button type='button' onClick={() => setOpen(!open)}
                aria-expanded={open} aria-label='Persönliche Warteschlange anzeigen'>
                Warteschlange ({items.length})
            </button>
            {open && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <strong>Meine Warteschlange</strong>
                        <button type='button' disabled={items.length === 0}
                            onClick={() => {
                                if (!window.confirm('Persönliche Warteschlange wirklich leeren?')) return;
                                clearSoloQueue(apiClient, profileId);
                                rerender();
                            }}>Liste leeren</button>
                    </div>
                    <div style={{ display: 'flex', overflowX: 'auto', gap: 12, padding: '12px 0' }}>
                        {items.map((entry, index) => (
                            <div key={entry.id} style={{ flex: '0 0 160px', minWidth: 0 }}>
                                <div style={{ fontWeight: 600 }}>{entry.seriesTitle || entry.title}</div>
                                <small>{entry.itemType === 'Episode'
                                    ? `Staffel ${entry.seasonNumber ?? '?'} · Folge ${entry.episodeNumber ?? '?'}`
                                    : entry.itemType}</small>
                                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                                    <button type='button' aria-label='Nach links'
                                        disabled={index === 0}
                                        onClick={() => { moveSoloQueueItem(apiClient, profileId, index, index - 1); rerender(); }}>←</button>
                                    <button type='button' aria-label='Nach rechts'
                                        disabled={index === items.length - 1}
                                        onClick={() => { moveSoloQueueItem(apiClient, profileId, index, index + 1); rerender(); }}>→</button>
                                    <button type='button' aria-label='Eintrag entfernen'
                                        onClick={() => { removeSoloQueueItem(apiClient, profileId, entry.id); rerender(); }}>×</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    {items.length === 0 && <p>Noch keine Inhalte eingereiht.</p>}
                </div>
            )}
        </section>
    );
};

export default SoloQueuePanel;
