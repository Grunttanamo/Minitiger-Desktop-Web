import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useApi } from 'hooks/useApi';
import { applyMinitigerSeason, getCachedMinitigerSeason, readMinitigerSeason, SEASON_EVENT, type MinitigerSeason } from '../../routes/minitiger/home/seasonalEvents';
import { startBatFlights, startPosterDecorations } from './halloweenDecor';
import './MinitigerSeasonalHost.scss';

const seeds = [
    [8,13],[24,35],[44,65],[68,24],[85,78],[16,81],[38,19],[57,88],[77,46],[92,16],
    [12,52],[33,74],[52,28],[73,92],[88,53],[29,14],[63,57],[96,72]
];
const MinitigerSeasonalHost = () => {
    const { __legacyApiClient__: apiClient, user } = useApi();
    const location = useLocation();
    const [season,setSeason] = useState<MinitigerSeason>(getCachedMinitigerSeason);
    const layerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: Event) => setSeason((e as CustomEvent<MinitigerSeason>).detail);
        window.addEventListener(SEASON_EVENT,handler);
        return () => window.removeEventListener(SEASON_EVENT,handler);
    }, []);
    useEffect(() => {
        if (!apiClient || !user) return;
        let cancelled = false;
        const refresh = () => void readMinitigerSeason(apiClient).then(value => {
            if (!cancelled) applyMinitigerSeason(value);
        }).catch(() => {});
        refresh();
        const timer = window.setInterval(refresh,60000);
        return () => { cancelled = true; window.clearInterval(timer); };
    },[apiClient,user?.Id]);
    useEffect(() => {
        document.documentElement.dataset.minitigerSeason = season;
        return () => { delete document.documentElement.dataset.minitigerSeason; };
    },[season]);
    const path = location.pathname.toLowerCase();
    const inPlayer = path.includes('/video') || path.includes('/playback') || path.includes('/player');

    const halloween = season === 'halloween' && Boolean(user) && !inPlayer;

    useEffect(() => {
        if (!halloween || !layerRef.current) return;
        return startBatFlights(layerRef.current);
    }, [halloween]);

    useEffect(() => {
        if (!halloween) return;
        // The whole body: preview cards are portals outside <main>.
        // Restarted per page (detail pages and virtual libraries only differ
        // in the query string), so every visit gets a fresh random layout.
        return startPosterDecorations(document.body);
    }, [halloween, location.pathname, location.search, user?.Id]);

    if (season === 'off' || !user || inPlayer) return null;
    return <div ref={layerRef} className={'minitigerGlobalSeason minitigerGlobalSeason-'+season} aria-hidden='true'>
        {season === 'christmas' && seeds.map(([x,y],i) => <span key={i} className='seasonFlake' style={{left:x+'%',top:y+'%','--seed':i} as React.CSSProperties}>{i%3===0?'❄':'❅'}</span>)}
    </div>;
};
export default MinitigerSeasonalHost;
