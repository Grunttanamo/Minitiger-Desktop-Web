import type { ApiClient } from 'jellyfin-apiclient';
import { readMinitigerBrandingConfiguration, updateMinitigerBrandingConfiguration } from './brandingConfig';

export type MinitigerSeason = 'off' | 'halloween' | 'christmas';
const MARKER = /<!--\s*MINITIGER_SEASON:([a-z]+)\s*-->/;
export const SEASON_EVENT = 'minitiger:season-changed';
export const readMinitigerSeason = async (apiClient: ApiClient): Promise<MinitigerSeason> => {
    const data = await readMinitigerBrandingConfiguration(apiClient);
    const match = MARKER.exec(data.LoginDisclaimer ?? '');
    return match?.[1] === 'halloween' || match?.[1] === 'christmas' ? match[1] : 'off';
};
export const writeMinitigerSeason = async (apiClient: ApiClient, season: MinitigerSeason) => {
    await updateMinitigerBrandingConfiguration(apiClient, current => {
        const existing = (current.LoginDisclaimer ?? '').replace(MARKER, '').trimEnd();
        return { ...current, LoginDisclaimer: `${existing}\n<!--MINITIGER_SEASON:${season}-->` };
    });
    window.dispatchEvent(new CustomEvent(SEASON_EVENT, { detail: season }));
};
