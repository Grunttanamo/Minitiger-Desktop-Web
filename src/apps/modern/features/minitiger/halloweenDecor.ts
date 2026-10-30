// Halloween decorations: bats that cross the screen on random flight paths
// and small poster decorations (carved pumpkins, cobwebs with a spider).
// Everything here is purely decorative, aria-hidden and pointer-events: none.

const BAT_SVG = `
<svg viewBox="0 0 64 34" aria-hidden="true">
  <g class="mtBatWing mtBatWingLeft">
    <path d="M30 15C25 7 15 4 2 9c4 2 6 5 6 9 3-2 6-1 8 2 2-3 5-3 8 0 1-3 4-3 6-1z"/>
  </g>
  <g class="mtBatWing mtBatWingRight">
    <path d="M34 15c5-8 15-11 28-6-4 2-6 5-6 9-3-2-6-1-8 2-2-3-5-3-8 0-1-3-4-3-6-1z"/>
  </g>
  <path class="mtBatBody" d="M29.4 6.5 31 10.8h2l1.6-4.3.9 5.4c1.6 2 1.8 7.4-3.5 13.1-5.3-5.7-5.1-11.1-3.5-13.1z"/>
  <circle class="mtBatEye" cx="30.6" cy="13.6" r=".9"/>
  <circle class="mtBatEye" cx="33.4" cy="13.6" r=".9"/>
</svg>`;

const PUMPKIN_SVG = `
<svg viewBox="0 0 64 58" aria-hidden="true">
  <defs>
    <radialGradient id="mtPumpkinSkin" cx="45%" cy="38%" r="70%">
      <stop offset="0" stop-color="#ffb347"/>
      <stop offset=".55" stop-color="#f07b16"/>
      <stop offset="1" stop-color="#a5420a"/>
    </radialGradient>
  </defs>
  <path class="mtPumpkinStem" d="M30 12c-.5-4 1-8 5-10l2.5 2.2c-2.6 1.6-3.6 4.4-3.2 8z"/>
  <ellipse cx="18" cy="34" rx="15" ry="20" fill="url(#mtPumpkinSkin)"/>
  <ellipse cx="46" cy="34" rx="15" ry="20" fill="url(#mtPumpkinSkin)"/>
  <ellipse cx="32" cy="33" rx="15" ry="21.5" fill="url(#mtPumpkinSkin)"/>
  <path class="mtPumpkinRib" d="M23 14c-5 10-5 30 0 40M41 14c5 10 5 30 0 40"/>
  <g class="mtPumpkinFace">
    <path d="M19 27l6-6.5 4 7.5zM45 27l-6-6.5-4 7.5zM29.4 33.6 32 29.5l2.6 4.1z"/>
    <path d="M15 37.5c5 7 29 7 34 0l-3.6 1.6-2.4 3.6-3-2.6-3.2 3.4-2.8-3.2-2.8 3.2-3.2-3.4-3 2.6-2.4-3.6z"/>
  </g>
</svg>`;

const COBWEB_SVG = (() => {
    const spokes = [0, 22, 45, 68, 90].map(deg => (deg * Math.PI) / 180);
    const lines = spokes
        .map(a => `<path d="M0 0L${(100 * Math.cos(a)).toFixed(1)} ${(100 * Math.sin(a)).toFixed(1)}"/>`)
        .join('');
    const rings = [18, 34, 51, 68, 86]
        .map(r => {
            let d = '';
            for (let i = 0; i < spokes.length - 1; i++) {
                const a = spokes[i];
                const b = spokes[i + 1];
                const mid = (a + b) / 2;
                const sag = r * 0.82;
                const x1 = (r * Math.cos(a)).toFixed(1);
                const y1 = (r * Math.sin(a)).toFixed(1);
                d += `${i === 0 ? `M${x1} ${y1}` : ''}Q${(sag * Math.cos(mid)).toFixed(1)} ${(sag * Math.sin(mid)).toFixed(1)} ${(r * Math.cos(b)).toFixed(1)} ${(r * Math.sin(b)).toFixed(1)}`;
            }
            return `<path d="${d}"/>`;
        })
        .join('');
    return `
<svg class="mtCobweb" viewBox="0 0 100 100" aria-hidden="true">${lines}${rings}</svg>
<div class="mtSpider">
  <svg viewBox="0 0 24 160" aria-hidden="true">
    <path class="mtSpiderThread" d="M12 0V142"/>
    <g class="mtSpiderLegs">
      <path d="M9 145 3 140 1 145M9 148 2 148 0 153M9 150 4 154 3 159M15 145 21 140 23 145M15 148 22 148 24 153M15 150 20 154 21 159"/>
    </g>
    <ellipse class="mtSpiderBody" cx="12" cy="148.5" rx="4.4" ry="5.4"/>
    <circle class="mtSpiderBody" cx="12" cy="142.5" r="2.8"/>
  </svg>
</div>`;
})();

const DECOR_CLASS = 'mtHalloweenDecor';
// Artwork in rows, grids and lists (home, libraries, seasons, previews).
const POSTER_SELECTOR = [
    '.minitigerPoster',
    '.cardImageContainer',
    '.minitigerSeasonEpisodeImage',
    '.minitigerSeriesEpisodeImage',
    '.minitigerMangaVolumeImage',
    '.minitigerVirtualHomeImage'
].join(', ');
// Single, prominent artwork: detail page posters and preview card heroes.
const FEATURED_SELECTOR = [
    '.minitigerDetailsPoster',
    '.minitigerMusicSquarePoster',
    '.minitigerEpisodeHeroImage',
    '.minitigerHoverPreviewHero',
    '.minitigerLargePreviewHero'
].join(', ');
// Wide heroes carry a logo and buttons at the bottom; keep them to the corner web.
const WEB_ONLY_SELECTOR = '.minitigerHoverPreviewHero, .minitigerLargePreviewHero, .minitigerEpisodeHeroImage';
const CARD_SELECTOR = [
    '.minitigerMediaCard',
    '.card',
    '.minitigerSeasonEpisodeItem',
    '.minitigerSeriesEpisodeCard',
    '.minitigerMangaVolumeCard'
].join(', ');
// Roughly every third or fourth poster, never on neighbouring cards.
const DECOR_PROBABILITY = 0.35;
const FEATURED_PROBABILITY = 0.6;
const MIN_ROW_DISTANCE = 2;
// The same decoration repeats in a row only with some distance.
const MIN_SAME_KIND_DISTANCE = 4;
const MAX_DECORATIONS = 30;

type DecorKind = 'pumpkin' | 'web';

const prefersReducedMotion = () =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

const random = (min: number, max: number) => min + Math.random() * (max - min);

/** Starts the bat spawner on a fixed, full-screen layer. Returns a stop function. */
export const startBatFlights = (layer: HTMLElement) => {
    if (prefersReducedMotion() || typeof layer.animate !== 'function') {
        return () => { /* nothing to stop */ };
    }

    const active = new Set<Animation>();
    let timer: number | undefined;

    const spawnBat = (fromLeft: boolean, startY: number, depth: number, delay: number) => {
        const width = layer.clientWidth;
        const height = layer.clientHeight;
        if (width < 200 || height < 200) return;

        // depth 0 = far away (small, slow, faded), depth 1 = close to the viewer.
        const size = Math.round(26 + depth * 38);
        const bat = document.createElement('div');
        bat.className = 'mtBat';
        bat.innerHTML = BAT_SVG;
        bat.style.width = `${size}px`;
        bat.style.opacity = (0.65 + depth * 0.35).toFixed(2);
        bat.style.setProperty('--mt-bat-flap', `${random(0.2, 0.3).toFixed(2)}s`);
        if (depth < 0.25) bat.style.filter = 'blur(0.6px)';
        layer.appendChild(bat);

        const x0 = fromLeft ? -size * 2 : width + size;
        const x1 = fromLeft ? width + size : -size * 2;
        const amplitude = random(18, 55) * (0.6 + depth * 0.6);
        const waves = random(1.2, 3.2);
        const phase = random(0, Math.PI * 2);
        const drift = random(-0.25, 0.25) * height;
        const growth = random(-0.15, 0.3);
        const steps = 28;
        const keyframes: Keyframe[] = [];
        let previousY = startY;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = x0 + (x1 - x0) * t;
            const y = startY + Math.sin(t * Math.PI * waves + phase) * amplitude + drift * t;
            const tilt = Math.max(-28, Math.min(28, (y - previousY) * 1.4)) * (fromLeft ? 1 : -1);
            previousY = y;
            const scale = 1 + growth * t;
            keyframes.push({
                transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg) scale(${scale.toFixed(3)})`
            });
        }

        const duration = (width / random(110, 170)) * (1.35 - depth * 0.55) * 1000;
        const animation = bat.animate(keyframes, { duration, delay, easing: 'linear', fill: 'both' });
        active.add(animation);
        const finish = () => {
            active.delete(animation);
            bat.remove();
        };
        animation.onfinish = finish;
        animation.oncancel = finish;
    };

    const spawnFlight = () => {
        if (document.hidden || active.size >= 5) return;
        const fromLeft = Math.random() < 0.5;
        const startY = random(0.06, 0.62) * layer.clientHeight;
        const depth = Math.random();
        const roll = Math.random();
        const count = roll < 0.65 ? 1 : roll < 0.9 ? 2 : 3;
        for (let i = 0; i < count; i++) {
            spawnBat(
                fromLeft,
                startY + random(-40, 40),
                Math.min(1, Math.max(0, depth + random(-0.15, 0.15))),
                i * random(250, 700)
            );
        }
    };

    const schedule = () => {
        timer = window.setTimeout(() => {
            spawnFlight();
            schedule();
        }, random(4000, 11000));
    };

    timer = window.setTimeout(() => {
        spawnFlight();
        schedule();
    }, random(600, 2200));

    return () => {
        window.clearTimeout(timer);
        active.forEach(animation => animation.cancel());
        active.clear();
    };
};

const createDecoration = (kind: DecorKind) => {
    const decor = document.createElement('div');
    decor.className = `${DECOR_CLASS} ${DECOR_CLASS}-${kind}`;
    decor.setAttribute('aria-hidden', 'true');
    decor.innerHTML = kind === 'pumpkin' ? PUMPKIN_SVG : COBWEB_SVG;
    // Desynchronise the idle animations of several decorations on one page.
    decor.style.setProperty('--mt-decor-delay', `${(-Math.random() * 8).toFixed(2)}s`);
    if (kind === 'web') {
        decor.style.setProperty('--mt-spider-drop', `${Math.round(random(45, 90))}%`);
    }
    return decor;
};

/**
 * Decorates a random, well-spread subset of posters inside root. The choice
 * is made once per item and page visit, so decorations stay put while rows
 * scroll or re-render. Returns a cleanup function.
 */
export const startPosterDecorations = (root: HTMLElement) => {
    const decisions = new Map<string, DecorKind | null>();
    const decidedElements = new WeakSet<HTMLElement>();
    const rowSlots = new Map<string, { index: number; kind: DecorKind }[]>();
    const containerIds = new WeakMap<Element, number>();
    let nextContainerId = 0;
    const restorePosition = new Map<HTMLElement, string>();
    let decorated = 0;
    let nextKind: DecorKind = Math.random() < 0.5 ? 'pumpkin' : 'web';
    let timer: number | undefined;

    // Horizontal carousels are one row. Grids (library pages) and vertical
    // lists (episodes) hold many visual rows, so split them by position.
    const rowKeyFor = (card: HTMLElement, row: Element | null) => {
        if (!row) return 'none';
        let id = containerIds.get(row);
        if (id === undefined) {
            id = nextContainerId++;
            containerIds.set(row, id);
        }
        const style = getComputedStyle(row);
        const carousel = style.display.includes('flex')
            && !style.flexDirection.startsWith('column')
            && style.flexWrap === 'nowrap';
        if (carousel) return String(id);
        const top = card.getBoundingClientRect().top + window.scrollY;
        return `${id}:${Math.round(top / Math.max(1, card.offsetHeight))}`;
    };

    const decide = (poster: HTMLElement): DecorKind | null => {
        const card = poster.closest<HTMLElement>(CARD_SELECTOR) ?? poster;
        const itemId = card.dataset.minitigerItemId ?? card.dataset.id;
        if (itemId && decisions.has(itemId)) return decisions.get(itemId) ?? null;

        let kind: DecorKind | null = null;
        const row = card.parentElement;
        const index = row ? Array.prototype.indexOf.call(row.children, card) : 0;
        const rowKey = rowKeyFor(card, row);
        const used = rowSlots.get(rowKey) ?? [];
        if (
            decorated < MAX_DECORATIONS
            && Math.random() < DECOR_PROBABILITY
            && !used.some(slot => Math.abs(slot.index - index) < MIN_ROW_DISTANCE)
        ) {
            const tooClose = (candidate: DecorKind) => used.some(slot =>
                slot.kind === candidate && Math.abs(slot.index - index) < MIN_SAME_KIND_DISTANCE
            );
            kind = nextKind;
            if (tooClose(kind)) kind = kind === 'pumpkin' ? 'web' : 'pumpkin';
            if (tooClose(kind)) {
                kind = null;
            } else {
                // Mostly alternate, but keep it from becoming a strict pattern.
                if (Math.random() < 0.75) nextKind = kind === 'pumpkin' ? 'web' : 'pumpkin';
                used.push({ index, kind });
                rowSlots.set(rowKey, used);
                decorated++;
            }
        }
        if (itemId) decisions.set(itemId, kind);
        return kind;
    };

    const decideFeatured = (poster: HTMLElement): DecorKind | null => {
        if (Math.random() >= FEATURED_PROBABILITY) return null;
        if (poster.matches(WEB_ONLY_SELECTOR)) return 'web';
        return Math.random() < 0.5 ? 'pumpkin' : 'web';
    };

    const visit = () => {
        root.querySelectorAll<HTMLElement>(`${POSTER_SELECTOR}, ${FEATURED_SELECTOR}`).forEach(poster => {
            if (
                decidedElements.has(poster)
                || poster.closest('[aria-hidden="true"], .minitigerGlobalSeason')
            ) return;
            const rect = poster.getBoundingClientRect();
            // Not laid out yet (or a tiny thumbnail): try again on the next pass.
            if (rect.width < 70 || rect.height < 45) return;
            decidedElements.add(poster);

            const kind = poster.matches(FEATURED_SELECTOR) ? decideFeatured(poster) : decide(poster);
            if (!kind || poster.querySelector(`:scope > .${DECOR_CLASS}`)) return;

            if (getComputedStyle(poster).position === 'static') {
                restorePosition.set(poster, poster.style.position);
                poster.style.position = 'relative';
            }
            // Below the progress bar (if any), above the artwork and its shade.
            poster.insertBefore(
                createDecoration(kind),
                poster.querySelector(':scope > .minitigerProgressTrack')
            );
        });
    };

    const schedule = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(visit, 250);
    };

    const observer = new MutationObserver(mutations => {
        const relevant = mutations.some(mutation =>
            Array.from(mutation.addedNodes).some(node =>
                node instanceof HTMLElement
                && !node.classList.contains(DECOR_CLASS)
                && !node.classList.contains('mtBat')
            )
        );
        if (relevant) schedule();
    });
    observer.observe(root, { childList: true, subtree: true });
    visit();

    return () => {
        observer.disconnect();
        window.clearTimeout(timer);
        root.querySelectorAll(`.${DECOR_CLASS}`).forEach(node => node.remove());
        restorePosition.forEach((previous, poster) => {
            poster.style.position = previous;
        });
        restorePosition.clear();
    };
};
