import type { ApiClient } from 'jellyfin-apiclient';

import {
    getMinitigerAccessToken
} from './bannerPlaylistUtils';

export type MinitigerTrailerDetectionStatus =
    | 'activated'
    | 'not_found'
    | 'incompatible';

export interface MinitigerTrailerDetectionResult {
    status: MinitigerTrailerDetectionStatus;
    message: string;
    itemId: string;
    trailerItemId?: string | null;
    trailerPath: string;
    videoCodec: string;
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

export const detectMinitigerLocalTrailer = async (
    apiClient: ApiClient,
    itemId: string
): Promise<MinitigerTrailerDetectionResult> => {
    const token =
        getMinitigerAccessToken(apiClient);

    const response = await fetch(
        apiClient.getUrl(
            'Minitiger/TrailerDetection/Detect',
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
        let detail = raw;

        try {
            const parsed =
                JSON.parse(raw) as {
                    message?: unknown;
                };

            if (
                typeof parsed.message
                === 'string'
            ) {
                detail = parsed.message;
            }
        } catch {
            // Plain text.
        }

        throw new Error(
            `Trailer-Erkennung HTTP ${response.status}${
                detail ? ` · ${detail}` : ''
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
            ) || 'incompatible'
        ) as MinitigerTrailerDetectionStatus,
        message: stringValue(
            pick(
                source,
                'message',
                'Message'
            )
        ),
        itemId: stringValue(
            pick(
                source,
                'itemId',
                'ItemId'
            )
        ),
        trailerItemId: stringValue(
            pick(
                source,
                'trailerItemId',
                'TrailerItemId'
            )
        ) || undefined,
        trailerPath: stringValue(
            pick(
                source,
                'trailerPath',
                'TrailerPath'
            )
        ),
        videoCodec: stringValue(
            pick(
                source,
                'videoCodec',
                'VideoCodec'
            )
        )
    };
};
