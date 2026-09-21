import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { ItemDto } from 'types/base/models/item-dto';

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
    const [ open, setOpen ] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const selectedSeason = useMemo(
        () => seasons.find(season => (season.Id ?? '') === value),
        [ seasons, value ]
    );

    useEffect(() => {
        if (!open) {
            return;
        }

        const onPointerDown = (event: MouseEvent) => {
            const root = rootRef.current;

            if (
                root
                && event.target instanceof Node
                && !root.contains(event.target)
            ) {
                setOpen(false);
            }
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [ open ]);

    useEffect(() => {
        if (disabled) {
            setOpen(false);
        }
    }, [ disabled ]);

    return (
        <div
            ref={rootRef}
            className={[
                'minitigerEpisodeSeasonSwitcher',
                'minitigerSeasonDropdown',
                open ? 'isOpen' : ''
            ].filter(Boolean).join(' ')}
        >
            <button
                type='button'
                className='minitigerSeasonDropdownButton'
                aria-label={ariaLabel}
                aria-haspopup='listbox'
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen(current => !current)}
            >
                <span>
                    {
                        selectedSeason
                            ? getSeasonLabel(selectedSeason)
                            : 'Staffel'
                    }
                </span>
                <span
                    className='minitigerSeasonDropdownChevron'
                    aria-hidden='true'
                >
                    ▾
                </span>
            </button>

            {open && (
                <div
                    className='minitigerSeasonDropdownMenu'
                    role='listbox'
                    aria-label={ariaLabel}
                >
                    {seasons.map(season => {
                        const seasonId = season.Id ?? '';
                        const selected = seasonId === value;

                        return (
                            <button
                                key={season.Id ?? season.Name}
                                type='button'
                                role='option'
                                aria-selected={selected}
                                className={[
                                    'minitigerSeasonDropdownOption',
                                    selected ? 'isSelected' : ''
                                ].filter(Boolean).join(' ')}
                                onClick={() => {
                                    onChange(seasonId);
                                    setOpen(false);
                                }}
                            >
                                {getSeasonLabel(season)}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MinitigerSeasonSwitcher;
