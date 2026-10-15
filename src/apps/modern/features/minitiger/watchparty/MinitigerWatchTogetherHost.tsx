import React, { useCallback, useEffect, useState } from 'react';
import { useApi } from 'hooks/useApi';
import {
    createWatchparty, getWatchparty, joinWatchparty, leaveWatchparty,
    sendWatchpartyCommand, type WatchpartyRoom
} from './watchpartyApi';
import { playbackManager } from 'components/playback/playbackmanager';
import Groups from '@mui/icons-material/Groups';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { activeSoloQueueProfileId, readSoloQueue } from './soloQueue';
import './MinitigerWatchTogetherHost.scss';

const ACTIVE_ROOM = 'minitiger.watchtogether.active.v1';

const MinitigerWatchTogetherHost = () => {
    const { user, __legacyApiClient__: apiClient } = useApi();
    const [open, setOpen] = useState(false);
    const [code, setCode] = useState('');
    const [room, setRoom] = useState<WatchpartyRoom | null>(null);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [selectedItem, setSelectedItem] = useState('');

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
        void getWatchparty(apiClient, previous).then(setRoom).catch(() => {
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
    const current = playbackManager.getCurrentPlayer();
    const currentItemId = current ? playbackManager.getPlayerState(current)?.NowPlayingItem?.Id : undefined;
    const choices = readSoloQueue(apiClient, activeSoloQueueProfileId(apiClient));
    const createItemId = currentItemId || selectedItem || choices[0]?.itemId;
    const change = async (action: 'play' | 'pause' | 'seek') => {
        if (!apiClient || !room || !host) return;
        const player = playbackManager.getCurrentPlayer();
        const state = player ? playbackManager.getPlayerState(player) : null;
        const ticks = Number(state?.PlayState?.PositionTicks || room.PositionTicks);
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
    // This is a room-management preview: do not modify local playback just
    // because a polled state changed until the readiness protocol is integrated.
    if (!apiClient || !user?.Id) return null;
    return <div className='minitigerWatchTogether'>
        <Tooltip title='WatchTogether'>
            <IconButton color='inherit' size='large' onClick={() => setOpen(!open)}
                aria-label='WatchTogether' aria-expanded={open}>
                <Groups />
            </IconButton>
        </Tooltip>
        {open && <section className='minitigerWatchTogetherPanel' aria-label='WatchTogether'>
            <header><strong>🐯 WatchTogether</strong>
                <button type='button' onClick={() => setOpen(false)} aria-label='Schließen'>×</button></header>
            {room ? <>
                <p>Raumcode: <strong>{room.Code}</strong> · {host ? 'Gastgeber' : 'Teilnehmer'}</p>
                <p>{room.Members.length} Teilnehmer · {room.Paused ? 'Pausiert' : 'Wiedergabe freigegeben'}</p>
                <small>Medium: {room.ItemId}</small>
                {host && <div className='minitigerWatchTogetherActions'>
                    <button type='button' disabled={busy} onClick={() => void change('play')}>▶ Gemeinsames Play</button>
                    <button type='button' disabled={busy} onClick={() => void change('pause')}>Ⅱ Pause</button>
                </div>}
                <button type='button' disabled={busy} onClick={() => void exit()}>
                    {host ? 'WatchTogether beenden' : 'Raum verlassen'}
                </button>
                <p className='minitigerWatchTogetherNotice'>TEST-Vorschau: Räume und Befehle sind aktiv. Automatisches Player-Folgen und Bereit-Synchronisierung folgen separat.</p>
            </> : <>
                {!currentItemId && choices.length > 0 && <label>Startmedium aus Warteschlange
                    <select value={selectedItem || choices[0]?.itemId} onChange={event => setSelectedItem(event.target.value)}>
                        {choices.map(item => <option key={item.id} value={item.itemId}>{item.title}</option>)}
                    </select>
                </label>}
                <button type='button' disabled={busy || !createItemId}
                    onClick={() => { if (createItemId) void perform(() => createWatchparty(apiClient, createItemId)); }}>
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
        </section>}
    </div>;
};

export default MinitigerWatchTogetherHost;
