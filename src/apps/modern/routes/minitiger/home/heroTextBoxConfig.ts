import type { ApiClient } from 'jellyfin-apiclient';
import { readMinitigerBrandingConfiguration, updateMinitigerBrandingConfiguration } from './brandingConfig';

export interface HeroTextBoxOptions { opacity: number; edgeSoftness: number }
export const DEFAULT_HERO_TEXT_BOX: HeroTextBoxOptions = { opacity: 78, edgeSoftness: 0 };
export const HERO_TEXT_BOX_EVENT = 'minitiger:hero-text-box-changed';
const MARKER = /<!--\s*MINITIGER_HERO_TEXT_BOX:([0-9]{1,3}),([0-9]{1,3})\s*-->/;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));
const normalize = (value: HeroTextBoxOptions): HeroTextBoxOptions => ({
    opacity: clamp(Math.round(value.opacity), 0, 100),
    edgeSoftness: clamp(Math.round(value.edgeSoftness), 0, 40)
});
let cached = DEFAULT_HERO_TEXT_BOX;
export const getCachedHeroTextBox = () => cached;
export const applyHeroTextBox = (options: HeroTextBoxOptions) => {
    const next = normalize(options);
    if (cached.opacity === next.opacity && cached.edgeSoftness === next.edgeSoftness) return;
    cached = next;
    window.dispatchEvent(new CustomEvent(HERO_TEXT_BOX_EVENT, { detail: next }));
};
export const readHeroTextBox = async (apiClient: ApiClient): Promise<HeroTextBoxOptions> => {
    const data = await readMinitigerBrandingConfiguration(apiClient);
    const found = MARKER.exec(data.LoginDisclaimer ?? '');
    return found ? normalize({ opacity: Number(found[1]), edgeSoftness: Number(found[2]) }) : DEFAULT_HERO_TEXT_BOX;
};
export const writeHeroTextBox = async (apiClient: ApiClient, options: HeroTextBoxOptions) => {
    const next = normalize(options);
    await updateMinitigerBrandingConfiguration(apiClient, current => ({
        ...current,
        LoginDisclaimer: (current.LoginDisclaimer ?? '').replace(MARKER, '').trimEnd()
            + '\n<!--MINITIGER_HERO_TEXT_BOX:' + next.opacity + ',' + next.edgeSoftness + '-->'
    }));
    applyHeroTextBox(next);
};
