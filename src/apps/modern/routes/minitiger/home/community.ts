import type { ApiClient } from 'jellyfin-apiclient';

import { getMinitigerAccessToken } from './apiAuth';

export interface MinitigerUserRatingState {
    itemId: string;
    rating: number | null;
    average: number | null;
    count: number;
}

export interface MinitigerCastPreferenceState {
    enabled: boolean;
    selectedIds: string[];
}

export interface MinitigerTopRatedResponse {
    items?: Array<{
        rank?: number;
        id?: string;
        average?: number;
        count?: number;
        score?: number;
    }>;
}

const authenticatedUrl = (
    apiClient: ApiClient,
    path: string,
    query?: Record<string, string | number>
) => {
    const token = getMinitigerAccessToken(apiClient);

    return apiClient.getUrl(
        path,
        {
            ...(query ?? {}),
            ...(token ? { ApiKey: token } : {})
        }
    );
};

const requestJson = async <T>(
    apiClient: ApiClient,
    path: string,
    init?: RequestInit,
    query?: Record<string, string | number>
): Promise<T> => {
    const response = await fetch(
        authenticatedUrl(apiClient, path, query),
        init
    );

    if (response.status === 404) {
        throw new Error(
            'Das Minitiger Companion Plugin muss für Bewertungen/Cast-Auswahl aktualisiert werden.'
        );
    }

    if (!response.ok) {
        const details = await response.text().catch(() => '');

        throw new Error(
            `Minitiger Community HTTP ${response.status}${details ? ` · ${details}` : ''}`
        );
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return await response.json() as T;
};

export const getMinitigerUserRating = async (
    apiClient: ApiClient,
    itemId: string
) => requestJson<MinitigerUserRatingState>(
    apiClient,
    `Minitiger/Community/Ratings/${encodeURIComponent(itemId)}`
);

export const setMinitigerUserRating = async (
    apiClient: ApiClient,
    itemId: string,
    rating: number
) => requestJson<MinitigerUserRatingState>(
    apiClient,
    `Minitiger/Community/Ratings/${encodeURIComponent(itemId)}`,
    {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ rating })
    }
);

export const clearMinitigerUserRating = async (
    apiClient: ApiClient,
    itemId: string
) => requestJson<void>(
    apiClient,
    `Minitiger/Community/Ratings/${encodeURIComponent(itemId)}`,
    {
        method: 'DELETE'
    }
);

export const getMinitigerCastPreference = async (
    apiClient: ApiClient,
    itemId: string
) => requestJson<MinitigerCastPreferenceState>(
    apiClient,
    `Minitiger/Community/Cast/${encodeURIComponent(itemId)}`
);

export const setMinitigerCastPreference = async (
    apiClient: ApiClient,
    itemId: string,
    selectedIds: string[]
) => requestJson<MinitigerCastPreferenceState>(
    apiClient,
    `Minitiger/Community/Cast/${encodeURIComponent(itemId)}`,
    {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ selectedIds })
    }
);

export const resetMinitigerCastPreference = async (
    apiClient: ApiClient,
    itemId: string
) => requestJson<void>(
    apiClient,
    `Minitiger/Community/Cast/${encodeURIComponent(itemId)}`,
    {
        method: 'DELETE'
    }
);

export const getMinitigerTopRated = async (
    apiClient: ApiClient,
    libraryId: string,
    limit = 40
) => requestJson<MinitigerTopRatedResponse>(
    apiClient,
    'Minitiger/Community/Ratings/Top',
    undefined,
    {
        libraryId,
        limit
    }
);

// MINITIGER_PATCH_MARKER: COMMUNITY_CLIENT_V1
