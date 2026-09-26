import type { ApiClient } from 'jellyfin-apiclient';

import {
    getMinitigerAccessToken
} from './bannerPlaylistUtils';

export interface MinitigerDirectoryUpdateResult {
    status:
        | 'updated'
        | 'busy'
        | 'unsupported'
        | 'error';
    message: string;
    requestedItemId: string;
    scanItemId: string;
    scanItemName: string;
    scanPath: string;
}

export interface MinitigerDirectoryUpdateLibrary {
    id: string;
    name: string;
    collectionType: string;
    locations: string[];
}

export interface MinitigerLibraryPrefixScanFoundItem {
    kind: string;
    name: string;
    newItems: number;
    newEpisodes: number;
    newBooks: number;
    summary: string;
    path: string;
}

export interface MinitigerLibraryPrefixScanStatus {
    status: string;
    running: boolean;
    completed: boolean;
    libraryId: string;
    libraryName: string;
    prefix: string;
    total: number;
    processed: number;
    newItems: number;
    currentItem: string;
    message: string;
    foundItems: MinitigerLibraryPrefixScanFoundItem[];
    errors: string[];
}

const pick = (
    source: Record<string, unknown>,
    camel: string,
    pascal: string
) => source[camel] ?? source[pascal];

const stringValue = (
    value: unknown
) => typeof value === 'string'
    ? value
    : '';

const numberValue = (
    value: unknown
) => Number.isFinite(
    Number(value)
)
    ? Number(value)
    : 0;

const boolValue = (
    value: unknown
) => value === true;

const apiUrl = (
    apiClient: ApiClient,
    path: string
) => {
    const token =
        getMinitigerAccessToken(apiClient);

    return apiClient.getUrl(
        `Minitiger/DirectoryUpdate/${path}`,
        token ? { ApiKey: token } : {}
    );
};

const request = async (
    apiClient: ApiClient,
    path: string,
    method: 'GET' | 'POST',
    body?: unknown
) => {
    const response =
        await fetch(
            apiUrl(
                apiClient,
                path
            ),
            {
                method,
                headers: body
                    ? {
                        'Content-Type':
                            'application/json'
                    }
                    : undefined,
                body: body
                    ? JSON.stringify(body)
                    : undefined
            }
        );

    const raw =
        await response.text();

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error(
                'Das Minitiger Companion Plugin ist für den Bibliotheks-Teilscan noch zu alt.'
            );
        }

        throw new Error(
            `Verzeichnis-Update HTTP ${response.status}${
                raw ? ` · ${raw}` : ''
            }`
        );
    }

    return raw
        ? JSON.parse(raw) as unknown
        : {};
};

const normalizeFoundItem = (
    value: unknown
): MinitigerLibraryPrefixScanFoundItem => {
    const source =
        value && typeof value === 'object'
            ? value as Record<string, unknown>
            : {};

    return {
        kind: stringValue(
            pick(source, 'kind', 'Kind')
        ),
        name: stringValue(
            pick(source, 'name', 'Name')
        ),
        newItems: numberValue(
            pick(source, 'newItems', 'NewItems')
        ),
        newEpisodes: numberValue(
            pick(source, 'newEpisodes', 'NewEpisodes')
        ),
        newBooks: numberValue(
            pick(source, 'newBooks', 'NewBooks')
        ),
        summary: stringValue(
            pick(source, 'summary', 'Summary')
        ),
        path: stringValue(
            pick(source, 'path', 'Path')
        )
    };
};

export const normalizeMinitigerLibraryPrefixScanStatus = (
    value: unknown
): MinitigerLibraryPrefixScanStatus => {
    const source =
        value && typeof value === 'object'
            ? value as Record<string, unknown>
            : {};

    const found =
        pick(
            source,
            'foundItems',
            'FoundItems'
        );

    const errors =
        pick(
            source,
            'errors',
            'Errors'
        );

    return {
        status: stringValue(
            pick(source, 'status', 'Status')
        ) || 'idle',
        running: boolValue(
            pick(source, 'running', 'Running')
        ),
        completed: boolValue(
            pick(source, 'completed', 'Completed')
        ),
        libraryId: stringValue(
            pick(source, 'libraryId', 'LibraryId')
        ),
        libraryName: stringValue(
            pick(source, 'libraryName', 'LibraryName')
        ),
        prefix: stringValue(
            pick(source, 'prefix', 'Prefix')
        ),
        total: numberValue(
            pick(source, 'total', 'Total')
        ),
        processed: numberValue(
            pick(source, 'processed', 'Processed')
        ),
        newItems: numberValue(
            pick(source, 'newItems', 'NewItems')
        ),
        currentItem: stringValue(
            pick(source, 'currentItem', 'CurrentItem')
        ),
        message: stringValue(
            pick(source, 'message', 'Message')
        ),
        foundItems: Array.isArray(found)
            ? found.map(
                normalizeFoundItem
            )
            : [],
        errors: Array.isArray(errors)
            ? errors.filter(
                (entry): entry is string =>
                    typeof entry === 'string'
            )
            : []
    };
};

export const getMinitigerDirectoryUpdateLibraries = async (
    apiClient: ApiClient
): Promise<MinitigerDirectoryUpdateLibrary[]> => {
    const raw =
        await request(
            apiClient,
            'Libraries',
            'GET'
        );

    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .map(value => {
            const source =
                value && typeof value === 'object'
                    ? value as Record<string, unknown>
                    : {};

            const locations =
                pick(
                    source,
                    'locations',
                    'Locations'
                );

            return {
                id: stringValue(
                    pick(source, 'id', 'Id')
                ),
                name: stringValue(
                    pick(source, 'name', 'Name')
                ),
                collectionType: stringValue(
                    pick(
                        source,
                        'collectionType',
                        'CollectionType'
                    )
                ),
                locations: Array.isArray(locations)
                    ? locations.filter(
                        (entry): entry is string =>
                            typeof entry === 'string'
                    )
                    : []
            };
        })
        .filter(
            library =>
                Boolean(
                    library.id
                    && library.name
                )
        );
};

export const startMinitigerLibraryPrefixScan = async (
    apiClient: ApiClient,
    libraryId: string,
    prefix: string
): Promise<MinitigerLibraryPrefixScanStatus> =>
    normalizeMinitigerLibraryPrefixScanStatus(
        await request(
            apiClient,
            'Prefix/Start',
            'POST',
            {
                libraryId,
                prefix
            }
        )
    );

export const getMinitigerLibraryPrefixScanStatus = async (
    apiClient: ApiClient
): Promise<MinitigerLibraryPrefixScanStatus> =>
    normalizeMinitigerLibraryPrefixScanStatus(
        await request(
            apiClient,
            'Prefix/Status',
            'GET'
        )
    );

export const runMinitigerDirectoryUpdate = async (
    apiClient: ApiClient,
    itemId: string
): Promise<MinitigerDirectoryUpdateResult> => {
    const source =
        await request(
            apiClient,
            'Run',
            'POST',
            {
                itemId
            }
        ) as Record<string, unknown>;

    return {
        status: (
            stringValue(
                pick(
                    source,
                    'status',
                    'Status'
                )
            ) || 'error'
        ) as MinitigerDirectoryUpdateResult['status'],
        message: stringValue(
            pick(
                source,
                'message',
                'Message'
            )
        ),
        requestedItemId: stringValue(
            pick(
                source,
                'requestedItemId',
                'RequestedItemId'
            )
        ),
        scanItemId: stringValue(
            pick(
                source,
                'scanItemId',
                'ScanItemId'
            )
        ),
        scanItemName: stringValue(
            pick(
                source,
                'scanItemName',
                'ScanItemName'
            )
        ),
        scanPath: stringValue(
            pick(
                source,
                'scanPath',
                'ScanPath'
            )
        )
    };
};
