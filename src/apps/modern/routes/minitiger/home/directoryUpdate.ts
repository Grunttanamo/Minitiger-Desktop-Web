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

export const runMinitigerDirectoryUpdate = async (
    apiClient: ApiClient,
    itemId: string
): Promise<MinitigerDirectoryUpdateResult> => {
    const token =
        getMinitigerAccessToken(apiClient);

    const response = await fetch(
        apiClient.getUrl(
            'Minitiger/DirectoryUpdate/Run',
            token ? { ApiKey: token } : {}
        ),
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                itemId
            })
        }
    );

    const raw =
        await response.text();

    if (!response.ok) {
        throw new Error(
            `Verzeichnis-Update HTTP ${response.status}${
                raw ? ` · ${raw}` : ''
            }`
        );
    }

    const source = (
        raw
            ? JSON.parse(raw)
            : {}
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
