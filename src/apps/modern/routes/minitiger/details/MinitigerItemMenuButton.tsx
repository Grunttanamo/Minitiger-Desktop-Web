import { useQueryClient } from '@tanstack/react-query';
import type { ApiClient } from 'jellyfin-apiclient';
import React from 'react';

import type { ItemDto } from 'types/base/models/item-dto';

interface Props {
    apiClient?: ApiClient;
    item: Pick<ItemDto, 'Id' | 'Name' | 'Type'>;
    title?: string;
    placement?: 'card' | 'action';
    allowDelete?: boolean;
}

const MinitigerItemMenuButton = ({
    apiClient,
    item,
    title = 'Mehr',
    placement = 'card',
    allowDelete = true
}: Props) => {
    const queryClient = useQueryClient();

    if (!item.Id) {
        return null;
    }

    const openMenu = async (
        event: React.MouseEvent<HTMLButtonElement>
    ) => {
        event.preventDefault();
        event.stopPropagation();

        if (!apiClient || !item.Id) {
            return;
        }

        const sourceButton = event.currentTarget;
        const userId = apiClient.getCurrentUserId();

        if (!userId) {
            return;
        }

        try {
            const [
                itemContextMenu,
                detailedItem,
                currentUser
            ] = await Promise.all([
                import('components/itemContextMenu'),
                apiClient.getItem(
                    userId,
                    item.Id
                ) as Promise<ItemDto>,
                apiClient.getCurrentUser()
            ]);

            const type = String(
                detailedItem.Type
                ?? item.Type
                ?? ''
            ).toLowerCase();

            const playable = ![
                'person',
                'book',
                'folder'
            ].includes(type);

            const result = await itemContextMenu.show({
                item: detailedItem,
                user: currentUser,
                positionTo: sourceButton,
                play: playable,
                queue: playable,
                shuffle:
                    type === 'season'
                    || type === 'musicalbum',
                playlist: playable,
                deleteItem: allowDelete,
                playAllFromHere:
                    type === 'season'
                    || type === 'musicalbum'
            });

            if (result?.updated || result?.deleted) {
                // Keep the editor interaction responsive. Refetch only the
                // item that was actually edited; broad list/home caches are
                // marked stale without immediately waking all active rows.
                if (
                    result.updated
                    && !result.deleted
                    && item.Id
                ) {
                    await queryClient.invalidateQueries({
                        queryKey: [
                            'User',
                            userId,
                            'Items',
                            item.Id
                        ]
                    });
                }

                void queryClient.invalidateQueries({
                    queryKey: [ 'Items' ],
                    refetchType: 'none'
                });

                void queryClient.invalidateQueries({
                    queryKey: [ 'Minitiger' ],
                    refetchType: 'none'
                });
            }
        } catch (error) {
            console.error(
                '[Minitiger Details] Karten-Menü konnte nicht geöffnet werden',
                error
            );
        }
    };

    return (
        <button
            type='button'
            className={placement === 'action'
                ? 'minitigerDetailsActionMenu'
                : 'minitigerDetailsCardMenu'}
            title={title}
            aria-label={title}
            onClick={openMenu}
        >
            ⋮
        </button>
    );
};

export default MinitigerItemMenuButton;
