import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApi } from 'hooks/useApi';
import {
    createWatchparty, getWatchparty, joinWatchparty, leaveWatchparty,
    sendWatchpartyCommand, setWatchpartyReady, enqueueWatchpartyItem, removeWatchpartyQueuedItem, type WatchpartyRoom
} from './watchpartyApi';
import { playbackManager } from 'components/playback/playbackmanager';
import Groups from '@mui/icons-material/Groups';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { activeSoloQueueProfileId, readSoloQueue } from './soloQueue';
import './MinitigerWatchTogetherHost.scss';

const ACTIVE_ROOM = 'minitiger.watchtogether.active.v1';
// A toolbar remount must NEVER replay an old Play command after the user
// intentionally closes the video player. Keep the cursor outside React state.
const appliedSequenceKey = (server: string, user: string, roomCode: string) =>
    'minitiger.watchtogether.applied.v1:' + server + ':' + user + ':' + roomCode;


const MinitigerWatchTogetherHost = () => {
    const { user, __legacyApiClient__: apiClient } = useApi();
    const [open, setOpen] = useState(false);
    const [code, setCode] = useState('');
    const [room, setRoom] = useState<WatchpartyRoom | null>(null);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [selectedItem, setSelectedItem] = useState('');
    const [queuedTitles, setQueuedTitles] = useState<Record<string, string>>({});
    const appliedSequence = useRef<string>('');
    const [playerOsdVisible, setPlayerOsdVisible] = useState(true);

    useEffect(() => {
        const onVisibility = (event: Event) => {
            setPlayerOsdVisible(Boolean((event as CustomEvent<boolean>).detail));
        };
        window.addEventListener('minitiger:video-osd-visibility', onVisibility);
        return () => window.removeEventListener('minitiger:video-osd-visibility', onVisibility);
    }, []);

    const refresh = useCallback(async () => {
        if (!apiClient || !room?.Code) return;
        try {
            const updated = await getWatchparty(apiClient, room.Code);
            setRoom(updated);
        } catch {
            setRoom(null);
            sessionStorage.removeItem(ACTIVE_ROOM);
            setMessage('WatchTogether-Raum wurde beendet oder ist nicht mehr erreichbar.');
        }
    }, [apiClient, room?.Code]);

    useEffect(() => {
        if (!apiClient) return;
        const previous = sessionStorage.getItem(ACTIVE_ROOM);
        if (!previous) return;
        void getWatchparty(apiClient, previous).then(snapshot => {
            // Joining/reopening the toolbar observes existing state; only NEW
            // commands issued afterwards should initiate playback.
            const cursor = appliedSequenceKey(apiClient.serverId() || 'server', apiClient.getCurrentUserId() || 'user', snapshot.Code);
            if (sessionStorage.getItem(cursor) === null) {
                sessionStorage.setItem(cursor, String(snapshot.Sequence));
            }
            setRoom(snapshot);
        }).catch(() => {
            sessionStorage.removeItem(ACTIVE_ROOM);
        });
    }, [apiClient]);

    useEffect(() => {
        if (!room) return;
        const timer = window.setInterval(() => void refresh(), 1500);
        return () => window.clearInterval(timer);
    }, [room?.Code, refresh]);

    const perform = async (action: () => Promise<WatchpartyRoom>) => {
        setBusy(true); setMessage('');
        try {
            const result = await action();
            setRoom(result);
            sessionStorage.setItem(ACTIVE_ROOM, result.Code);
        } catch (e) {
            setMessage('WatchTogether: ' + (e instanceof Error ? e.message : String(e)));
        } finally { setBusy(false); }
    };
    const host = Boolean(room && user?.Id === room.HostUserId);
    useEffect(() => {
        if (!apiClient || !room) return;
        let cancelled = false;
        const uniqueIds = Array.from(new Set([room.ItemId, ...(room.Queue || [])]));
        void Promise.all(uniqueIds.map(async itemId => {
            try {
                const item = await apiClient.getItem(apiClient.getCurrentUserId(), itemId);
                return [itemId, item?.Name || itemId] as const;
            } catch {
                return [itemId, itemId] as const;
            }
        })).then(titles => {
            if (!cancelled) setQueuedTitles(Object.fromEntries(titles));
        });
        return () => { cancelled = true; };
    }, [apiClient, room?.Code, room?.ItemId, room?.Queue?.join(',')]);

    const ownReady = Boolean(room?.ReadyMembers?.includes(user?.Id || ''));
    const current = playbackManager.getCurrentPlayer();
    const currentItemId = current ? playbackManager.getPlayerState(current)?.NowPlayingItem?.Id : undefined;
    const choices = apiClient ? readSoloQueue(apiClient, activeSoloQueueProfileId(apiClient)) : [];
    const createItemId = currentItemId || selectedItem || choices[0]?.itemId;
    // Each client plays the room's item through its own authenticated Jellyfin
    // connection. The server transmits commands/timeline, never video bytes.
    useEffect(() => {
        if (!apiClient || !room || room.Sequence < 1) return;
        const key = room.Code + ':' + room.Sequence;
        const cursor = appliedSequenceKey(apiClient.serverId() || 'server', apiClient.getCurrentUserId() || 'user', room.Code);
        const seen = Number(sessionStorage.getItem(cursor) ?? '0');
        if (appliedSequence.current === key || room.Sequence <= seen) return;
        // Mark command as handled BEFORE async player startup. Even if the
        // React toolbar unmounts, the old command cannot launch a film again.
        sessionStorage.setItem(cursor, String(room.Sequence));
        appliedSequence.current = key;
        let cancelled = false;
        const apply = async () => {
            const player = playbackManager.getCurrentPlayer();
            const state = player ? playbackManager.getPlayerState(player) : null;
            const playingId = state?.NowPlayingItem?.Id;
            if (room.LastAction === 'pause') {
                if (player && playingId === room.ItemId && !playbackManager.paused(player)) playbackManager.pause(player);
                return;
            }
            if (room.LastAction === 'play' && (!player || playingId !== room.ItemId)) {
                let item = await apiClient.getItem(apiClient.getCurrentUserId(), room.ItemId);
                if (item?.Type === 'Series' || item?.Type === 'Season') {
                    const entries = await apiClient.getItems(apiClient.getCurrentUserId(), {
                        ParentId: item.Id,
                        Recursive: item.Type === 'Series',
                        IncludeItemTypes: 'Episode',
                        IsMissing: false,
                        Limit: 1000,
                        EnableTotalRecordCount: false
                    });
                    const episodes = (entries.Items || [])
                        .filter(e => e.Id && e.LocationType !== 'Virtual' && e.LocationType !== 'Offline')
                        .sort((a, b) => (a.ParentIndexNumber ?? 9999) - (b.ParentIndexNumber ?? 9999)
                            || (a.IndexNumber ?? 9999) - (b.IndexNumber ?? 9999));
                    item = episodes.find(e => !e.UserData?.Played) || episodes[0];
                }
                if (!item?.Id || cancelled) return;
                // Player start promises can remain pending for the media lifetime.
                void playbackManager.play({ items: [item], startPositionTicks: room.PositionTicks })
                    .catch(error => setMessage('Wiedergabestart fehlgeschlagen: ' + String(error)));
                return;
            }
            if (player && playingId === room.ItemId) {
                if (room.LastAction === 'seek' || room.LastAction === 'skip') {
                    playbackManager.seek(room.PositionTicks, player);
                }
                if (room.LastAction === 'play' && playbackManager.paused(player)) {
                    playbackManager.unpause(player);
                }
            }
        };
        void apply().catch(e => { if (!cancelled) setMessage('WatchTogether-Player: ' + String(e)); });
        return () => { cancelled = true; };
    }, [apiClient, room?.Code, room?.Sequence, room?.LastAction, room?.ItemId, room?.PositionTicks]);

    const createFromSelection = async (itemId: string) => {
        if (!apiClient) return;
        try {
            let selected = await apiClient.getItem(apiClient.getCurrentUserId(), itemId);
            if (selected?.Type === 'Series' || selected?.Type === 'Season') {
                const episodes = await apiClient.getItems(apiClient.getCurrentUserId(), {
                    ParentId: selected.Id,
                    Recursive: selected.Type === 'Series',
                    IncludeItemTypes: 'Episode',
                    IsMissing: false,
                    Limit: 1000,
                    EnableTotalRecordCount: false
                });
                const playable = (episodes.Items || [])
                    .filter(e => e.Id && e.LocationType !== 'Virtual' && e.LocationType !== 'Offline')
                    .sort((a, b) => (a.ParentIndexNumber ?? 9999) - (b.ParentIndexNumber ?? 9999)
                        || (a.IndexNumber ?? 9999) - (b.IndexNumber ?? 9999));
                selected = playable.find(e => !e.UserData?.Played) || playable[0];
            }
            if (!selected?.Id) throw new Error('Kein abspielbarer Film oder Folge gefunden.');
            await perform(() => createWatchparty(apiClient, selected.Id!));
        } catch (error) {
            setMessage('WatchTogether-Raumerstellung: ' + String(error));
        }
    };

    const change = async (action: 'play' | 'pause' | 'seek') => {
        if (!apiClient || !room || !host) return;
        const player = playbackManager.getCurrentPlayer();
        const state = player ? playbackManager.getPlayerState(player) : null;
        const ticks = state?.NowPlayingItem?.Id === room.ItemId
            ? Number(state.PlayState?.PositionTicks ?? room.PositionTicks)
            : room.PositionTicks;
        await perform(() => sendWatchpartyCommand(apiClient, room.Code, action, ticks, action !== 'play'));
    };
    const exit = async () => {
        if (!apiClient || !room) return;
        setBusy(true);
        try {
            await leaveWatchparty(apiClient, room.Code);
            setRoom(null);
            sessionStorage.removeItem(ACTIVE_ROOM);
        } catch (e) { setMessage(String(e)); }
        finally { setBusy(false); }
    };
    if (!apiClient || !user?.Id) return null;
    return <div className='minitigerWatchTogether'>
        <Tooltip title='WatchTogether'>
            <IconButton color='inherit' size='large' onClick={() => setOpen(!open)}
                aria-label='WatchTogether' aria-expanded={open}>
                <Groups />
            </IconButton>
        </Tooltip>
        {open && playerOsdVisible && createPortal(<section className='minitigerWatchTogetherPanel' aria-label='WatchTogether'>
            <header><strong>🐯 WatchTogether</strong>
                <button type='button' onClick={() => setOpen(false)} aria-label='Schließen'>×</button></header>
            {room ? <>
                <p>Raumcode: <strong>{room.Code}</strong> · {host ? 'Gastgeber' : 'Teilnehmer'}</p>
                <p>{room.Members.length} Teilnehmer · {room.Paused ? 'Pausiert' : 'Wiedergabe freigegeben'}</p>
                <p>Bereit: {room.ReadyMembers?.length || 0}/{room.Members.length}</p>
                <button type='button' disabled={busy} onClick={() => void perform(() => setWatchpartyReady(apiClient, room.Code, !ownReady))}>
                    {ownReady ? 'Bereitschaft zurücknehmen' : 'Ich bin bereit'}
                </button>
                <strong>Gemeinsame Warteschlange ({room.Queue?.length || 0})</strong>
                {(room.Queue || []).map((id, index) => <div key={index} className='minitigerWatchTogetherQueueRow'>
                    <img src={apiClient.getUrl('Items/' + encodeURIComponent(id) + '/Images/Primary', { maxWidth: 96 })} alt='' loading='lazy' />
                    <small>{index + 1}. {queuedTitles[id] || choices.find(e => e.itemId === id)?.title || id}</small>
                    {host && <button type='button' disabled={busy} onClick={() => void perform(() => removeWatchpartyQueuedItem(apiClient, room.Code, index))}>×</button>}
                </div>)}
                {choices.length > 0 && <>
                    <label>Inhalt zur WatchTogether-Warteschlange hinzufügen
                        <select value={selectedItem || choices[0].itemId}
                            onChange={event => setSelectedItem(event.target.value)}>
                            {choices.map(entry => <option key={entry.id} value={entry.itemId}>{entry.title}</option>)}
                        </select>
                    </label>
                    <div className='minitigerWatchTogetherQueuePreview'>
                        <img src={apiClient.getUrl('Items/' + encodeURIComponent(selectedItem || choices[0].itemId) + '/Images/Primary', { maxWidth: 130 })} alt='' />
                        <span>{choices.find(entry => entry.itemId === (selectedItem || choices[0].itemId))?.title}</span>
                    </div>
                    <button type='button' disabled={busy}
                        onClick={() => void perform(() => enqueueWatchpartyItem(apiClient, room.Code, selectedItem || choices[0].itemId))}>
                        + Ausgewählten Inhalt einreihen
                    </button>
                </>}

                {host && <div className='minitigerWatchTogetherActions'>
                    <button type='button' disabled={busy || !room.AllReady} onClick={() => void change('play')}>▶ Gemeinsames Play</button>
                    <button type='button' disabled={busy} onClick={() => void change('pause')}>Ⅱ Pause</button>
                </div>}
                <button type='button' disabled={busy} onClick={() => void exit()}>
                    {host ? 'WatchTogether beenden' : 'Raum verlassen'}
                </button>
                <p className='minitigerWatchTogetherNotice'>TEST: Gemeinsames Play startet den eigenen Jellyfin-Player jedes Teilnehmers. Die Bereitschaft wird derzeit manuell bestätigt; automatisches Puffern und präziser Gleichzeit-Start folgen.</p>
            </> : <>
                {!currentItemId && choices.length > 0 && <label>Startmedium aus Warteschlange
                    <select value={selectedItem || choices[0]?.itemId} onChange={event => setSelectedItem(event.target.value)}>
                        {choices.map(item => <option key={item.id} value={item.itemId}>{item.title}</option>)}
                    </select>
                </label>}
                <button type='button' disabled={busy || !createItemId}
                    onClick={() => { if (createItemId) void createFromSelection(createItemId); }}>
                    WatchTogether-Raum erstellen
                </button>
                {!createItemId && <small>Starte einen Film oder reihe zuerst einen Inhalt ein, um einen Raum zu erstellen.</small>}
                <label>Mit Raumcode beitreten
                    <input value={code} onChange={event => setCode(event.target.value.toUpperCase())}
                        maxLength={8} placeholder='8-stelliger Code' />
                </label>
                <button type='button' disabled={busy || code.trim().length !== 8}
                    onClick={() => void perform(() => joinWatchparty(apiClient, code))}>Beitreten</button>
            </>}
            {message && <p role='status'>{message}</p>}
        </section>, document.body)}
    </div>;
};

export default MinitigerWatchTogetherHost;
