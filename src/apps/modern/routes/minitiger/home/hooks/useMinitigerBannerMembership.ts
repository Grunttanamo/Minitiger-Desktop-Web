import {
    useMutation,
    useQuery,
    useQueryClient
} from '@tanstack/react-query';
import { useCallback } from 'react';

import { useApi } from 'hooks/useApi';

import {
    addItemToMinitigerBanner,
    addSeriesToMinitigerBanner,
    getMinitigerBannerMembership,
    removeItemFromMinitigerBanner,
    setMinitigerBannerSeriesMembership,
    setMinitigerGlobalBannerItemMembership
} from '../bannerPlaylistUtils';

const useMinitigerBannerMembership = (
    itemId?: string | null,
    itemType?: string | null,
    enabled = true
) => {
    const {
        __legacyApiClient__: apiClient
    } = useApi();

    const queryClient =
        useQueryClient();

    const serverId =
        apiClient?.serverId();

    const userId =
        apiClient?.getCurrentUserId();

    const normalizedType =
        String(
            itemType
            ?? ''
        ).toLowerCase();

    const isSeries =
        normalizedType === 'series';

    const queryKey = [
        'Minitiger',
        'BannerMembership',
        serverId,
        userId,
        itemId,
        normalizedType
    ];

    const query = useQuery({
        queryKey,
        queryFn: () =>
            getMinitigerBannerMembership(
                apiClient!,
                itemId!,
                itemType
            ),
        enabled: Boolean(
            enabled
            && apiClient
            && userId
            && itemId
        ),
        staleTime: 10_000,
        refetchOnWindowFocus: false
    });

    const mutation = useMutation({
        mutationFn: async () => {
            if (
                !apiClient
                || !itemId
            ) {
                return;
            }

            if (isSeries) {
                if (query.data?.inBanner) {
                    if (
                        query.data.playlistId
                        && query.data.entryIds?.length
                    ) {
                        await removeItemFromMinitigerBanner(
                            apiClient,
                            query.data.playlistId,
                            query.data.entryIds
                        );
                    }

                    /* 18.2.5 briefly stored Series IDs in DisplayPreferences.
                       Keep removal compatibility for those already saved IDs,
                       but new Series selections use a real playlist marker. */
                    if (query.data?.storedSeries) {
                        await setMinitigerBannerSeriesMembership(
                            apiClient,
                            itemId,
                            false
                        );
                    }

                    await setMinitigerGlobalBannerItemMembership(
                        apiClient,
                        itemId,
                        false
                    );

                    return;
                }

                /* Jellyfin expands a Series added to a playlist into every
                   playable episode.  Use exactly ONE episode as an internal
                   marker instead; banner reconstruction maps its SeriesId back
                   to the top-level Series. */
                await addSeriesToMinitigerBanner(
                    apiClient,
                    itemId
                );

                await setMinitigerGlobalBannerItemMembership(
                    apiClient,
                    itemId,
                    true
                );

                return;
            }

            if (query.data?.inBanner) {
                if (
                    query.data.playlistId
                    && query.data.entryIds?.length
                ) {
                    await removeItemFromMinitigerBanner(
                        apiClient,
                        query.data.playlistId,
                        query.data.entryIds
                    );
                }

                await setMinitigerGlobalBannerItemMembership(
                    apiClient,
                    itemId,
                    false
                );

                return;
            }

            await addItemToMinitigerBanner(
                apiClient,
                itemId
            );

            await setMinitigerGlobalBannerItemMembership(
                apiClient,
                itemId,
                true
            );
        },
        onSuccess: async () => {
            await Promise.all([
                query.refetch(),
                queryClient.invalidateQueries({
                    queryKey: [
                        'Minitiger',
                        'BannerPlaylist'
                    ]
                })
            ]);
        },
        onError: error => {
            console.error(
                '[Minitiger Banner] Banner-Zuordnung konnte nicht geändert werden',
                error
            );
        }
    });

    const toggle =
        useCallback(() => {
            if (!mutation.isPending) {
                mutation.mutate();
            }
        }, [mutation]);

    return {
        inBanner:
            Boolean(
                query.data?.inBanner
            ),
        isPending:
            query.isPending,
        isSaving:
            mutation.isPending,
        error:
            query.error
            ?? mutation.error,
        toggle
    };
};

export default useMinitigerBannerMembership;
