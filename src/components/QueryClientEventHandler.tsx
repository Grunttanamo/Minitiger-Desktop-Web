import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, type FC } from 'react';

import type { ItemDto } from 'types/base/models/item-dto';

import { EventType } from 'constants/eventType';
import { useApi } from 'hooks/useApi';
import Events from 'utils/events';

const MINITIGER_IMAGE_UPDATED_EVENT =
    'minitiger:image-updated';

interface MinitigerImageUpdatedDetail {
    itemId?: string;
    item?: ItemDto;
    revision?: number;
}

const patchCachedItem = (
    value: unknown,
    itemId: string,
    freshItem: ItemDto
): unknown => {
    if (Array.isArray(value)) {
        let changed = false;

        const next = value.map(entry => {
            const patched =
                patchCachedItem(
                    entry,
                    itemId,
                    freshItem
                );

            if (patched !== entry) {
                changed = true;
            }

            return patched;
        });

        return changed
            ? next
            : value;
    }

    if (
        !value
        || typeof value !== 'object'
    ) {
        return value;
    }

    const source =
        value as Record<string, unknown>;

    if (
        String(source.Id ?? '')
        === itemId
    ) {
        return {
            ...source,
            ...freshItem
        };
    }

    let next:
        Record<string, unknown>
        | undefined;

    for (const key of [
        'Items',
        'People'
    ]) {
        const child =
            source[key];

        if (!Array.isArray(child)) {
            continue;
        }

        const patched =
            patchCachedItem(
                child,
                itemId,
                freshItem
            );

        if (patched !== child) {
            next ??= {
                ...source
            };
            next[key] = patched;
        }
    }

    return next ?? value;
};

/** Component that handles mapping events to query client actions. */
const QueryClientEventHandler: FC = () => {
    const queryClient = useQueryClient();
    const { user } = useApi();

    const invalidateItemQueries = useCallback(() => (
        queryClient.invalidateQueries({
            queryKey: ['User', user?.Id, 'Items']
        })
    ), [queryClient, user?.Id]);

    useEffect(() => {
        Events.on(document, EventType.REFRESH_NEEDED, invalidateItemQueries);

        const handleMinitigerImageUpdated = (
            event: Event
        ) => {
            const detail =
                (event as CustomEvent<MinitigerImageUpdatedDetail>)
                    .detail;

            const itemId =
                String(
                    detail?.itemId
                    ?? detail?.item?.Id
                    ?? ''
                );

            const freshItem =
                detail?.item;

            if (
                !itemId
                || !freshItem
            ) {
                return;
            }

            queryClient.setQueriesData(
                {
                    predicate: query => {
                        const root =
                            String(
                                query.queryKey[0]
                                ?? ''
                            );

                        return root === 'User'
                            || root === 'Items'
                            || root === 'Minitiger';
                    }
                },
                current =>
                    patchCachedItem(
                        current,
                        itemId,
                        freshItem
                    )
            );
        };

        document.addEventListener(
            MINITIGER_IMAGE_UPDATED_EVENT,
            handleMinitigerImageUpdated
        );

        return () => {
            Events.off(document, EventType.REFRESH_NEEDED, invalidateItemQueries);
            document.removeEventListener(
                MINITIGER_IMAGE_UPDATED_EVENT,
                handleMinitigerImageUpdated
            );
        };
    }, [
        invalidateItemQueries,
        queryClient
    ]);

    return null;
};

export default QueryClientEventHandler;
