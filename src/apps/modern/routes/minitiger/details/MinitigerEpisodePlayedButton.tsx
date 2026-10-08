import { useQueryClient } from '@tanstack/react-query';
import React, {
    useEffect,
    useState
} from 'react';

import { useTogglePlayedMutation } from 'hooks/useFetchItems';
import type { ItemDto } from 'types/base/models/item-dto';

interface Props {
    item: ItemDto;
    placement?: 'overlay' | 'inline';
    className?: string;
}

const MinitigerEpisodePlayedButton = ({
    item,
    placement = 'overlay',
    className = ''
}: Props) => {
    const queryClient =
        useQueryClient();

    const playedMutation =
        useTogglePlayedMutation();

    const [
        played,
        setPlayed
    ] = useState(
        Boolean(
            item.UserData?.Played
        )
    );

    useEffect(() => {
        setPlayed(
            Boolean(
                item.UserData?.Played
            )
        );
    }, [
        item.Id,
        item.UserData?.Played
    ]);

    const toggle = async (
        event: React.MouseEvent<HTMLButtonElement>
    ) => {
        event.preventDefault();
        event.stopPropagation();

        if (
            !item.Id
            || playedMutation.isPending
        ) {
            return;
        }

        const next =
            await playedMutation
                .mutateAsync({
                    itemId: item.Id,
                    isPlayed: played
                });

        setPlayed(
            typeof next === 'boolean'
                ? next
                : !played
        );

        await queryClient.invalidateQueries({
            queryKey: [ 'Items' ]
        });
    };

    return (
        <button
            type='button'
            className={[
                'minitigerEpisodePlayedButton',
                placement === 'overlay'
                    ? 'isOverlay'
                    : 'isInline',
                played
                    ? 'isActive'
                    : '',
                className
            ].filter(Boolean).join(' ')}
            title={
                played
                    ? 'Als ungesehen markieren'
                    : 'Als gesehen markieren'
            }
            aria-label={
                played
                    ? `${item.Name ?? 'Folge'} als ungesehen markieren`
                    : `${item.Name ?? 'Folge'} als gesehen markieren`
            }
            aria-pressed={played}
            disabled={playedMutation.isPending}
            onClick={toggle}
        >
            <span aria-hidden='true'>
                ✓
            </span>
        </button>
    );
};

export default MinitigerEpisodePlayedButton;
