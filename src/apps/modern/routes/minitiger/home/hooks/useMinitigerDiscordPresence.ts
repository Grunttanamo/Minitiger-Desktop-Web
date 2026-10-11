import { useEffect } from 'react';

import { useApi } from 'hooks/useApi';

import { getMinitigerAccessToken } from '../apiAuth';
import useMinitigerHomeSettings from './useMinitigerHomeSettings';

interface MinitigerSignal {
    connect?: (callback: (...args: unknown[]) => void) => void;
    disconnect?: (callback: (...args: unknown[]) => void) => void;
}

interface MinitigerDiscordBridge {
    setArtworkUrl?: (url: string) => void;
}

interface MinitigerPlayerBridge {
    onMetaData?: MinitigerSignal;
}

interface MinitigerWindow extends Window {
    initCompleted?: Promise<unknown>;
    api?: {
        discord?: MinitigerDiscordBridge;
        player?: MinitigerPlayerBridge;
    };
}

interface RemoteImageInfo {
    ProviderName?: string | null;
    Url?: string | null;
    ThumbnailUrl?: string | null;
    Type?: string | null;
}

interface RemoteImageResult {
    Images?: RemoteImageInfo[] | null;
}

interface PlaybackMetadata {
    Id?: string | null;
    Type?: string | null;
    ParentId?: string | null;
    SeasonId?: string | null;
    SeriesId?: string | null;
}

const providerMatches = (
    providerName: string,
    wanted: 'tvdb' | 'tmdb'
) => {
    const normalized =
        providerName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');

    return wanted === 'tvdb'
        ? normalized.includes('tvdb')
        : (
            normalized.includes('themoviedb')
            || normalized.includes('tmdb')
        );
};

const useMinitigerDiscordPresence = () => {
    const { settings } = useMinitigerHomeSettings();
    const {
        __legacyApiClient__: apiClient
    } = useApi();

    useEffect(() => {
        let cancelled = false;

        const apply = () => {
            if (cancelled) {
                return;
            }

            const configure =
                window.NativeShell
                    ?.configureDiscordPresence;

            if (typeof configure !== 'function') {
                return;
            }

            configure({
                enabled:
                    settings.discordPresenceEnabled,
                clientId:
                    settings.discordApplicationId,
                showTitle:
                    settings.discordPresenceShowTitle,
                showEpisode:
                    settings.discordPresenceShowEpisode,
                showProgress:
                    settings.discordPresenceShowProgress
            });
        };

        const init =
            (window as MinitigerWindow)
                .initCompleted;

        if (init && typeof init.then === 'function') {
            void init.then(apply);
        } else {
            apply();
        }

        return () => {
            cancelled = true;
        };
    }, [
        settings.discordApplicationId,
        settings.discordPresenceEnabled,
        settings.discordPresenceShowEpisode,
        settings.discordPresenceShowProgress,
        settings.discordPresenceShowTitle
    ]);

    useEffect(() => {
        if (
            !settings.discordPresenceEnabled
            || !apiClient
        ) {
            return;
        }

        let cancelled = false;
        let requestVersion = 0;

        const resolveRemoteArtwork = async (
            metadataValue: unknown
        ) => {
            const metadata =
                (
                    metadataValue
                    && typeof metadataValue === 'object'
                )
                    ? metadataValue as PlaybackMetadata
                    : {};

            const type =
                String(metadata.Type ?? '')
                    .toLowerCase();

            const wantedProvider:
                'tvdb' | 'tmdb' | null =
                type === 'episode'
                || type === 'series'
                    ? 'tvdb'
                    : type === 'movie'
                        ? 'tmdb'
                        : null;

            const bridge =
                (window as MinitigerWindow)
                    .api
                    ?.discord;

            if (!bridge?.setArtworkUrl) {
                return;
            }

            if (!wantedProvider) {
                bridge.setArtworkUrl('');
                return;
            }

            const candidateIds =
                wantedProvider === 'tvdb'
                    ? [
                        metadata.SeasonId,
                        metadata.ParentId,
                        metadata.SeriesId,
                        metadata.Id
                    ]
                    : [
                        metadata.Id
                    ];

            const targetIds = Array.from(
                new Set(
                    candidateIds
                        .map(value =>
                            String(value ?? '').trim()
                        )
                        .filter(Boolean)
                )
            );

            const currentVersion =
                ++requestVersion;

            const token =
                getMinitigerAccessToken(
                    apiClient
                );

            for (const targetId of targetIds) {
                if (
                    cancelled
                    || currentVersion !== requestVersion
                ) {
                    return;
                }

                try {
                    const url =
                        apiClient.getUrl(
                            `Items/${encodeURIComponent(targetId)}/RemoteImages`,
                            {
                                type: 'Primary',
                                limit: 30,
                                includeAllLanguages: true,
                                ...(token
                                    ? { ApiKey: token }
                                    : {})
                            }
                        );

                    const response =
                        await fetch(url);

                    if (!response.ok) {
                        continue;
                    }

                    const result =
                        await response.json()
                            as RemoteImageResult;

                    const image =
                        (result.Images ?? [])
                            .find(candidate =>
                                providerMatches(
                                    String(
                                        candidate.ProviderName
                                        ?? ''
                                    ),
                                    wantedProvider
                                )
                                && Boolean(
                                    candidate.Url
                                    ?? candidate.ThumbnailUrl
                                )
                            );

                    const imageUrl =
                        String(
                            image?.Url
                            ?? image?.ThumbnailUrl
                            ?? ''
                        ).trim();

                    if (
                        imageUrl.startsWith('https://')
                        && imageUrl.length <= 300
                    ) {
                        bridge.setArtworkUrl(
                            imageUrl
                        );
                        return;
                    }
                } catch (error) {
                    console.warn(
                        '[Minitiger Discord] Provider-Poster konnte nicht geladen werden.',
                        error
                    );
                }
            }

            if (
                !cancelled
                && currentVersion === requestVersion
            ) {
                bridge.setArtworkUrl('');
            }
        };

        const attach = () => {
            const player =
                (window as MinitigerWindow)
                    .api
                    ?.player;

            const signal =
                player?.onMetaData;

            if (!signal?.connect) {
                return;
            }

            const onMetaData =
                (...args: unknown[]) => {
                    void resolveRemoteArtwork(
                        args[0]
                    );
                };

            signal.connect(onMetaData);

            return () => {
                signal.disconnect?.(
                    onMetaData
                );
            };
        };

        let detach:
            (() => void)
            | undefined;

        const init =
            (window as MinitigerWindow)
                .initCompleted;

        if (init && typeof init.then === 'function') {
            void init.then(() => {
                if (!cancelled) {
                    detach = attach();
                }
            });
        } else {
            detach = attach();
        }

        return () => {
            cancelled = true;
            requestVersion += 1;
            detach?.();
        };
    }, [
        apiClient,
        settings.discordPresenceEnabled
    ]);
};

export default useMinitigerDiscordPresence;
