import type { ApiClient } from 'jellyfin-apiclient';

import { getMinitigerAccessToken } from './apiAuth';

export const MINITIGER_CONTENT_TYPES = [
    'Anime',
    'OVA',
    'Anime Film',
    'Serie',
    'Film',
    'Manga',
    'Comic',
    'Musik',
    'Musikvideo'
] as const;

export type MinitigerContentType =
    typeof MINITIGER_CONTENT_TYPES[number];

export interface MinitigerContentRequest {
    id: string;
    requesterUserId: string;
    requesterName: string;
    title: string;
    contentType: MinitigerContentType;
    comment: string;
    createdAtUtc: string;
}

const authenticatedUrl = (
    apiClient: ApiClient,
    path: string
) => {
    const token = getMinitigerAccessToken(apiClient);

    return apiClient.getUrl(
        path,
        token ? { ApiKey: token } : {}
    );
};

const requestJson = async <T>(
    apiClient: ApiClient,
    path: string,
    init?: RequestInit
): Promise<T> => {
    const response = await fetch(
        authenticatedUrl(apiClient, path),
        init
    );

    if (response.status === 404) {
        throw new Error(
            'Das Minitiger Companion Plugin muss für Inhaltsanfragen aktualisiert werden.'
        );
    }

    if (!response.ok) {
        const details = await response.text().catch(() => '');

        throw new Error(
            `Minitiger Inhaltsanfragen HTTP ${response.status}${details ? ` · ${details}` : ''}`
        );
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return await response.json() as T;
};

const pick = (
    source: Record<string, unknown>,
    camel: string,
    pascal: string
) => source[camel] ?? source[pascal];

const normalizeRequest = (
    raw: unknown
): MinitigerContentRequest | null => {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const source = raw as Record<string, unknown>;
    const id = String(pick(source, 'id', 'Id') ?? '').trim();
    const title = String(pick(source, 'title', 'Title') ?? '').trim();
    const contentType = String(
        pick(source, 'contentType', 'ContentType') ?? ''
    ).trim() as MinitigerContentType;

    if (
        !id
        || !title
        || !MINITIGER_CONTENT_TYPES.includes(contentType)
    ) {
        return null;
    }

    return {
        id,
        requesterUserId: String(
            pick(
                source,
                'requesterUserId',
                'RequesterUserId'
            ) ?? ''
        ).trim(),
        requesterName: String(
            pick(
                source,
                'requesterName',
                'RequesterName'
            ) ?? 'Unbekannt'
        ).trim() || 'Unbekannt',
        title,
        contentType,
        comment: String(
            pick(source, 'comment', 'Comment') ?? ''
        ),
        createdAtUtc: String(
            pick(
                source,
                'createdAtUtc',
                'CreatedAtUtc'
            ) ?? ''
        ).trim()
    };
};

export const submitMinitigerContentRequest = async (
    apiClient: ApiClient,
    request: {
        title: string;
        contentType: MinitigerContentType;
        comment?: string;
    }
) => {
    const raw = await requestJson<unknown>(
        apiClient,
        'Minitiger/ContentRequests',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(request)
        }
    );

    const normalized = normalizeRequest(raw);

    if (!normalized) {
        throw new Error(
            'Die Inhaltsanfrage konnte nicht gelesen werden.'
        );
    }

    return normalized;
};

export const getMinitigerContentRequests = async (
    apiClient: ApiClient
) => {
    const raw = await requestJson<unknown>(
        apiClient,
        'Minitiger/ContentRequests'
    );

    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .map(normalizeRequest)
        .filter(
            (
                value
            ): value is MinitigerContentRequest =>
                Boolean(value)
        );
};

export const deleteMinitigerContentRequest = async (
    apiClient: ApiClient,
    requestId: string
) => {
    await requestJson<void>(
        apiClient,
        `Minitiger/ContentRequests/${encodeURIComponent(requestId)}`,
        {
            method: 'DELETE'
        }
    );
};

// MINITIGER_PATCH_MARKER: CONTENT_REQUESTS_V1
