import React, { useMemo } from 'react';

import type { ItemDto } from 'types/base/models/item-dto';

import MinitigerSelectDropdown from './MinitigerSelectDropdown';

interface Props {
    seasons: ItemDto[];
    value: string;
    onChange: (seasonId: string) => void;
    disabled?: boolean;
    ariaLabel?: string;
}

const getSeasonLabel = (season: ItemDto) =>
    season.Name
    ?? `Staffel ${season.IndexNumber ?? ''}`;

const MinitigerSeasonSwitcher = ({
    seasons,
    value,
    onChange,
    disabled = false,
    ariaLabel = 'Staffel auswählen'
}: Props) => {
    const options = useMemo(
        () => seasons.map((season, index) => ({
            value: season.Id ?? '',
            label: getSeasonLabel(season),
            key:
                season.Id
                ?? season.Name
                ?? `season-${index}`
        })),
        [ seasons ]
    );

    return (
        <MinitigerSelectDropdown
            value={value}
            options={options}
            onChange={onChange}
            disabled={disabled}
            ariaLabel={ariaLabel}
            className='minitigerEpisodeSeasonSwitcher'
            variant='season'
            fallbackLabel='Staffel'
            fallbackToFirstOption={false}
        />
    );
};

export default MinitigerSeasonSwitcher;
