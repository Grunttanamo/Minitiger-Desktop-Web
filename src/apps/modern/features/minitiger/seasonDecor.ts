// Shared engine for seasonal poster decorations (Halloween, Christmas):
// picks a random, well-spread subset of posters and anchors a decoration
// inside each one. Purely decorative, aria-hidden and pointer-events: none.

export type DecorSet = {
    /** Decorations for posters and episode images. */
    kinds: readonly string[];
    /** Decorations that fit wide preview heroes (top area only). */
    heroKinds: readonly string[];
    /** Creates the element; it must carry DECOR_CLASS. */
    create: (kind: string) => HTMLElement;
};

// Shared marker class of every poster decoration, whatever the season.
export const DECOR_CLASS = 'mtSeasonDecor';
// Artwork in rows, grids and lists (home, libraries, seasons, previews).
const POSTER_SELECTOR = [
    '.minitigerPoster',
    '.cardImageContainer',
    '.minitigerSeasonEpisodeImage',
    '.minitigerSeriesEpisodeImage',
    '.minitigerMangaVolumeImage',
    '.minitigerVirtualHomeImage',
    // Season and episode rails on series and episode detail pages.
    '.minitigerDetailsEpisodeCard > div',
    '.minitigerDetailsSeasonCard > div'
].join(', ');
// Single, prominent artwork: detail page posters and preview card heroes.
const FEATURED_SELECTOR = [
    '.minitigerDetailsPoster',
    '.minitigerMusicSquarePoster',
    '.minitigerEpisodeHeroImage',
    '.minitigerHoverPreviewHero',
    '.minitigerLargePreviewHero'
].join(', ');
// Wide heroes carry a logo and buttons at the bottom; only top decorations fit.
const WIDE_HERO_SELECTOR = '.minitigerHoverPreviewHero, .minitigerLargePreviewHero, .minitigerEpisodeHeroImage';
const CARD_SELECTOR = [
    '.minitigerMediaCard',
    '.card',
    '.minitigerSeasonEpisodeItem',
    '.minitigerSeriesEpisodeCard',
    '.minitigerMangaVolumeCard',
    '.minitigerDetailsEpisodeCard',
    '.minitigerDetailsSeasonCard'
].join(', ');
// Roughly every third or fourth poster, never on neighbouring cards.
const DECOR_PROBABILITY = 0.35;
const FEATURED_PROBABILITY = 0.6;
const MIN_ROW_DISTANCE = 2;
// The same decoration repeats in a row only with some distance.
const MIN_SAME_KIND_DISTANCE = 4;
const MAX_DECORATIONS = 30;

export const prefersReducedMotion = () =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export const random = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Decorates a random, well-spread subset of posters inside root with the
 * decorations of one season. The choice
 * is made once per item and page visit, so decorations stay put while rows
 * scroll or re-render. Returns a cleanup function.
 */
export const startPosterDecorations = (root: HTMLElement, set: DecorSet) => {
    type DecorKind = string;
    const decisions = new Map<string, DecorKind | null>();
    const decidedElements = new WeakSet<HTMLElement>();
    const rowSlots = new Map<string, { index: number; kind: DecorKind }[]>();
    const containerIds = new WeakMap<Element, number>();
    let nextContainerId = 0;
    const restorePosition = new Map<HTMLElement, string>();
    let decorated = 0;
    const pick = (kinds: readonly DecorKind[]) => kinds[Math.floor(Math.random() * kinds.length)];
    const others = (kind: DecorKind) => set.kinds.filter(candidate => candidate !== kind);
    let nextKind: DecorKind = pick(set.kinds);
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
            kind = [nextKind, ...others(nextKind)].find(candidate => !tooClose(candidate)) ?? null;
            if (kind) {
                // Mostly vary, but keep it from becoming a strict pattern.
                if (Math.random() < 0.75) nextKind = pick(others(kind));
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
        return pick(poster.matches(WIDE_HERO_SELECTOR) ? set.heroKinds : set.kinds);
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
                set.create(kind),
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
                && !node.closest('.minitigerGlobalSeason')
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
