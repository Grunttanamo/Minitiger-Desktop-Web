import type { ApiClient } from 'jellyfin-apiclient';

export interface WatchpartyRoom {
    Code: string;
    ItemId: string;
    HostUserId: string;
    Members: string[];
    ReadyMembers: string[];
    AllReady: boolean;
    Queue: string[];
    Sequence: number;
    PositionTicks: number;
    Paused: boolean;
    LastAction: 'play' | 'pause' | 'seek' | 'skip';
    UpdatedUtc: string;
}

export type WatchpartyAction = WatchpartyRoom['LastAction'];

const endpoint = (apiClient: ApiClient, path: string): string =>
    apiClient.getUrl('Minitiger/Watchparty/' + path);

const jsonRequest = async <T>(
    apiClient: ApiClient,
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    body?: object
): Promise<T> => {
    const response = await fetch(endpoint(apiClient, path), {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Emby-Token': apiClient.accessToken() || ''
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('HTTP 401 – Jellyfin hat die WatchTogether-Anmeldung abgewiesen. Companion 1.6.23.0 und Server-Neustart prüfen.');
        }
        if (response.status === 404) {
            throw new Error('HTTP 404 – WatchTogether-Endpunkt nicht gefunden. Companion-Version prüfen.');
        }
        throw new Error('Watchparty HTTP ' + response.status);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
};

export const createWatchparty = (apiClient: ApiClient, itemId: string) =>
    jsonRequest<WatchpartyRoom>(apiClient, 'Rooms', 'POST', { itemId });

export const joinWatchparty = (apiClient: ApiClient, code: string) =>
    jsonRequest<WatchpartyRoom>(apiClient, 'Rooms/Join', 'POST', {
        code: code.trim().toUpperCase()
    });

export const getWatchparty = (apiClient: ApiClient, code: string) =>
    jsonRequest<WatchpartyRoom>(
        apiClient, 'Rooms/' + encodeURIComponent(code.trim().toUpperCase()), 'GET'
    );

export const sendWatchpartyCommand = (
    apiClient: ApiClient,
    code: string,
    action: WatchpartyAction,
    positionTicks: number,
    paused: boolean
) => jsonRequest<WatchpartyRoom>(
    apiClient, 'Rooms/' + encodeURIComponent(code) + '/Command',
    'POST', { action, positionTicks, paused }
);

export const leaveWatchparty = (apiClient: ApiClient, code: string) =>
    jsonRequest<void>(
        apiClient, 'Rooms/' + encodeURIComponent(code) + '/Members/Me', 'DELETE'
    );

// Only synchronizes transport commands and timeline. Every participant starts
// local Jellyfin playback with their own authentication and stream selection.
export const shouldApplyWatchpartyState = (
    lastSequence: number, state: WatchpartyRoom
) => state.Sequence > lastSequence;

export const setWatchpartyReady = (apiClient: ApiClient, code: string, ready: boolean) =>
    jsonRequest<WatchpartyRoom>(apiClient, 'Rooms/' + encodeURIComponent(code) + '/Ready', 'POST', { ready });

export const enqueueWatchpartyItem = (apiClient: ApiClient, code: string, itemId: string) =>
    jsonRequest<WatchpartyRoom>(apiClient, 'Rooms/' + encodeURIComponent(code) + '/Queue', 'POST', { itemId });

export const removeWatchpartyQueuedItem = (apiClient: ApiClient, code: string, index: number) =>
    jsonRequest<WatchpartyRoom>(apiClient, 'Rooms/' + encodeURIComponent(code) + '/Queue/' + index, 'DELETE');
