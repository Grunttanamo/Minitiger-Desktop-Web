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

export type MinitigerRequestStatus =
    | 'Neu'
    | 'In Arbeit'
    | 'Hinzugefügt'
    | 'Nicht gefunden'
    | 'Abgelehnt';

export const MINITIGER_REQUEST_STATUSES: MinitigerRequestStatus[] = [
    'Neu', 'In Arbeit', 'Hinzugefügt', 'Nicht gefunden', 'Abgelehnt'
];

export interface MinitigerContentRequest {
    id: string;
    requesterUserId: string;
    requesterName: string;
    title: string;
    contentType: MinitigerContentType;
    comment: string;
    createdAtUtc: string;
    status: MinitigerRequestStatus;
    statusUpdatedAtUtc?: string;
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

    // A 404 on a particular request may mean an item was deleted, the
    // server is briefly unavailable, or an obsolete route was requested.
    // It is not proof that the installed Companion is outdated.

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
    const rawStatus = String(pick(source, 'status', 'Status') ?? 'Neu');
    const status = MINITIGER_REQUEST_STATUSES.includes(rawStatus as MinitigerRequestStatus)
        ? rawStatus as MinitigerRequestStatus
        : 'Neu';

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
        ).trim(),
        status,
        statusUpdatedAtUtc: String(pick(source, 'statusUpdatedAtUtc', 'StatusUpdatedAtUtc') ?? '')
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

export const getOwnMinitigerContentRequests = async (apiClient: ApiClient) => {
    const raw = await requestJson<unknown>(apiClient, 'Minitiger/ContentRequests/Mine');
    return Array.isArray(raw)
        ? raw.map(normalizeRequest).filter((item): item is MinitigerContentRequest => Boolean(item))
        : [];
};

export const updateMinitigerContentRequestStatus = async (
    apiClient: ApiClient,
    requestId: string,
    status: MinitigerRequestStatus
) => {
    const raw = await requestJson<unknown>(
        apiClient,
        `Minitiger/ContentRequests/${encodeURIComponent(requestId)}/Status`,
        {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        }
    );
    const item = normalizeRequest(raw);
    if (!item) throw new Error('Der aktualisierte Wunsch konnte nicht gelesen werden.');
    return item;
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
