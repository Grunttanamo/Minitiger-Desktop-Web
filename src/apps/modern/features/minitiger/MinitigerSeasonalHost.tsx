import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useApi } from 'hooks/useApi';
import { applyMinitigerSeason, getCachedMinitigerSeason, readMinitigerSeason, SEASON_EVENT, type MinitigerSeason } from '../../routes/minitiger/home/seasonalEvents';
import { christmasDecorations, startSleighFlights, startSnowfall } from './christmasDecor';
import { halloweenDecorations, startBatFlights } from './halloweenDecor';
import { startPosterDecorations } from './seasonDecor';
import './MinitigerSeasonalHost.scss';

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

    const active = Boolean(user) && !inPlayer;
    const halloween = season === 'halloween' && active;
    const christmas = season === 'christmas' && active;

    useEffect(() => {
        if (!halloween || !layerRef.current) return;
        return startBatFlights(layerRef.current);
    }, [halloween]);

    useEffect(() => {
        const layer = layerRef.current;
        if (!christmas || !layer) return;
        const stopSnow = startSnowfall(layer);
        const stopSleigh = startSleighFlights(layer);
        return () => {
            stopSleigh();
            stopSnow();
        };
    }, [christmas]);

    useEffect(() => {
        if (!halloween && !christmas) return;
        // The whole body: preview cards are portals outside <main>.
        // Restarted per page (detail pages and virtual libraries only differ
        // in the query string), so every visit gets a fresh random layout.
        return startPosterDecorations(
            document.body,
            halloween ? halloweenDecorations : christmasDecorations
        );
    }, [halloween, christmas, location.pathname, location.search, user?.Id]);

    if (season === 'off' || !user || inPlayer) return null;
    return <div ref={layerRef} className={'minitigerGlobalSeason minitigerGlobalSeason-'+season} aria-hidden='true' />;
};
export default MinitigerSeasonalHost;
