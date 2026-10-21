import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useApi } from 'hooks/useApi';
import { applyMinitigerSeason, getCachedMinitigerSeason, readMinitigerSeason, SEASON_EVENT, type MinitigerSeason } from '../../routes/minitiger/home/seasonalEvents';
import './MinitigerSeasonalHost.scss';

const seeds = [
    [8,13],[24,35],[44,65],[68,24],[85,78],[16,81],[38,19],[57,88],[77,46],[92,16],
    [12,52],[33,74],[52,28],[73,92],[88,53],[29,14],[63,57],[96,72]
];
// Decorative pumpkins belong to real content anchors; they scroll with their cards/headings.
const pumpkinSelectors = [
    '.minitigerHome .verticalSection h2',
    '.minitigerHome .card',
    '.minitigerHome .sectionTitle',
    '.minitigerDetailsPage .card',
    '.minitigerDetailsPage h2',
    '.libraryPage .card',
    'main .verticalSection h2',
    'main .itemsContainer > *',
    'main h2'
].join(', ');
const spotHash = (text: string) => {
    let n = 2166136261;
    for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619);
    return n >>> 0;
};
type BatSpot = { x: number; y: number; duration: number; delay: number; dx: number; dy: number };
const newBatSpots = (): BatSpot[] => {
    const spots: BatSpot[] = [];
    const zones = [[8, 36, 9, 35], [55, 90, 8, 32], [10, 42, 51, 83], [59, 90, 49, 84]];
    for (let i = zones.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [zones[i], zones[j]] = [zones[j], zones[i]];
    }
    for (const [xmin, xmax, ymin, ymax] of zones) {
        spots.push({
            x: xmin + Math.random() * (xmax - xmin),
            y: ymin + Math.random() * (ymax - ymin),
            duration: 11 + Math.random() * 5,
            delay: -Math.random() * 10,
            dx: 16 + Math.random() * 17,
            dy: 9 + Math.random() * 12
        });
    }
    return spots;
};
const MinitigerSeasonalHost = () => {
    const { __legacyApiClient__: apiClient, user } = useApi();
    const location = useLocation();
    const [season,setSeason] = useState<MinitigerSeason>(getCachedMinitigerSeason);
    const [bats,setBats] = useState<BatSpot[]>([]);
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

    useEffect(() => {
        setBats(season === 'halloween' && user && !inPlayer ? newBatSpots() : []);
    }, [season, location.pathname, location.search, user?.Id, inPlayer]);

    useEffect(() => {
        if (season !== 'halloween' || !user || inPlayer) return;
        const root = document.querySelector('main');
        if (!root) return;
        const anchored = new Map<HTMLElement, { badge: HTMLSpanElement; previous: string; changed: boolean }>();
        let timer: number | undefined;
        const cleanup = () => {
            anchored.forEach(({ badge, previous, changed }, target) => {
                badge.remove();
                if (changed) target.style.position = previous;
            });
            anchored.clear();
        };
        const decorate = () => {
            cleanup();
            const candidates = Array.from(root.querySelectorAll<HTMLElement>(pumpkinSelectors))
                .filter(node => !node.closest('.minitigerGlobalSeason, [aria-hidden="true"]'))
                .filter(node => {
                    const rect = node.getBoundingClientRect();
                    return rect.width > 70 && rect.height > 20;
                })
                .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
            const amount = Math.min(7, candidates.length);
            for (let i = 0; i < amount; i++) {
                const from = Math.floor(i * candidates.length / amount);
                const to = Math.max(from + 1, Math.floor((i + 1) * candidates.length / amount));
                const group = candidates.slice(from, to);
                const target = group.sort((a, b) =>
                    spotHash(path + ':' + a.textContent?.slice(0, 30) + ':' + from)
                    - spotHash(path + ':' + b.textContent?.slice(0, 30) + ':' + from)
                )[0];
                if (!target || anchored.has(target)) continue;
                const previous = target.style.position;
                const changed = getComputedStyle(target).position === 'static';
                if (changed) target.style.position = 'relative';
                const badge = document.createElement('span');
                badge.className = 'minitigerAnchoredPumpkin';
                badge.textContent = '🎃';
                badge.setAttribute('aria-hidden', 'true');
                badge.style.left = i % 2 ? '90%' : '5%';
                badge.style.top = i % 3 === 0 ? '-12px' : '-7px';
                target.appendChild(badge);
                anchored.set(target, { badge, previous, changed });
            }
        };
        const schedule = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(decorate, 200);
        };
        decorate();
        const observer = new MutationObserver(mutations => {
            if (mutations.some(m => Array.from(m.addedNodes).some(node =>
                !(node instanceof HTMLElement && node.classList.contains('minitigerAnchoredPumpkin'))
            ))) schedule();
        });
        observer.observe(root, { childList: true, subtree: true });
        return () => { observer.disconnect(); window.clearTimeout(timer); cleanup(); };
    }, [season, location.pathname, user?.Id, inPlayer]);

    if (season === 'off' || !user || inPlayer) return null;
    return <div className={'minitigerGlobalSeason minitigerGlobalSeason-'+season} aria-hidden='true'>
        {season === 'halloween'
            ? bats.map((bat,i) => <span key={i} className='seasonBat' style={{
                left: bat.x+'%', top: bat.y+'%',
                animationDelay: bat.delay+'s', animationDuration: bat.duration+'s',
                '--bat-dx': bat.dx+'px', '--bat-dy': bat.dy+'px'
            } as React.CSSProperties}>🦇</span>)
            : seeds.map(([x,y],i) => <span key={i} className='seasonFlake' style={{left:x+'%',top:y+'%','--seed':i} as React.CSSProperties}>{i%3===0?'❄':'❅'}</span>)}
    </div>;
};
export default MinitigerSeasonalHost;
