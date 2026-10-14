import type { ApiClient } from 'jellyfin-apiclient';
import type { ItemDto } from 'types/base/models/item-dto';

export interface SoloQueueEntry {
    id: string;
    itemId: string;
    itemType: string;
    title: string;
    seriesTitle?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    addedAt: number;
}

const PREFIX = 'minitiger.soloQueue.v1:';
export const SOLO_QUEUE_CHANGED = 'minitiger:solo-queue-changed';
const LIMIT = 150;

export const activeSoloQueueProfileId = (apiClient: ApiClient): string => {
    try {
        const value = sessionStorage.getItem('minitiger.profile-runtime.v1:' + apiClient.serverId());
        const parsed = value ? JSON.parse(value) as { activeProfileId?: string } : null;
        return parsed?.activeProfileId || 'owner';
    } catch { return 'owner'; }
};

const queueKey = (apiClient: ApiClient, profileId: string) => [
    PREFIX,
    apiClient.serverId() || 'server',
    apiClient.getCurrentUserId() || 'user',
    profileId || 'owner'
].join(':');

const notify = () => window.dispatchEvent(new Event(SOLO_QUEUE_CHANGED));

export const readSoloQueue = (apiClient: ApiClient, profileId = 'owner'): SoloQueueEntry[] => {
    try {
        const value = JSON.parse(localStorage.getItem(queueKey(apiClient, profileId)) || '[]') as unknown;
        if (!Array.isArray(value)) return [];
        return value.filter((entry): entry is SoloQueueEntry =>
            Boolean(entry && typeof entry === 'object'
                && typeof entry.itemId === 'string'
                && typeof entry.id === 'string'
                && typeof entry.title === 'string')).slice(0, LIMIT);
    } catch {
        return [];
    }
};

const save = (apiClient: ApiClient, profileId: string, entries: SoloQueueEntry[]) => {
    localStorage.setItem(queueKey(apiClient, profileId), JSON.stringify(entries.slice(0, LIMIT)));
    notify();
};

export const addSoloQueueItem = (
    apiClient: ApiClient, profileId: string, item: ItemDto
): SoloQueueEntry[] => {
    if (!item.Id) return readSoloQueue(apiClient, profileId);
    const entries = readSoloQueue(apiClient, profileId);
    if (entries.length >= LIMIT) return entries;
    const entry: SoloQueueEntry = {
        id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        itemId: item.Id,
        itemType: String(item.Type || ''),
        title: item.Name || 'Unbekannt',
        seriesTitle: item.SeriesName || undefined,
        seasonNumber: item.ParentIndexNumber ?? undefined,
        episodeNumber: item.IndexNumber ?? undefined,
        addedAt: Date.now()
    };
    const next = [...entries, entry];
    save(apiClient, profileId, next);
    return next;
};

export const removeSoloQueueItem = (apiClient: ApiClient, profileId: string, entryId: string) => {
    save(apiClient, profileId, readSoloQueue(apiClient, profileId).filter(entry => entry.id !== entryId));
};

export const clearSoloQueue = (apiClient: ApiClient, profileId: string) => save(apiClient, profileId, []);

export const moveSoloQueueItem = (apiClient: ApiClient, profileId: string, from: number, to: number) => {
    const entries = readSoloQueue(apiClient, profileId);
    if (from < 0 || to < 0 || from >= entries.length || to >= entries.length) return;
    const [entry] = entries.splice(from, 1);
    entries.splice(to, 0, entry);
    save(apiClient, profileId, entries);
};

export const popSoloQueueItem = (apiClient: ApiClient, profileId: string) => {
    const entries = readSoloQueue(apiClient, profileId);
    const first = entries.shift();
    if (first) save(apiClient, profileId, entries);
    return first;
};
