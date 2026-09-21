import React, { useEffect, useRef, useState } from 'react';

export interface MinitigerSelectOption {
    value: string;
    label: string;
}

interface Props {
    value: string;
    options: MinitigerSelectOption[];
    onChange: (value: string) => void;
    disabled?: boolean;
    ariaLabel?: string;
    className?: string;
}

const MinitigerSelectDropdown = ({
    value,
    options,
    onChange,
    disabled = false,
    ariaLabel = 'Auswahl',
    className
}: Props) => {
    const [ open, setOpen ] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const selected =
        options.find(option => option.value === value)
        ?? options[0];

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
                'minitigerSelectDropdown',
                open ? 'isOpen' : '',
                className ?? ''
            ].filter(Boolean).join(' ')}
        >
            <button
                type='button'
                className='minitigerSelectDropdownButton'
                aria-label={ariaLabel}
                aria-haspopup='listbox'
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen(current => !current)}
            >
                <span className='minitigerSelectDropdownValue'>
                    {selected?.label ?? 'Auswahl'}
                </span>
                <span
                    className='minitigerSelectDropdownChevron'
                    aria-hidden='true'
                >
                    ▾
                </span>
            </button>

            {open && (
                <div
                    className='minitigerSelectDropdownMenu'
                    role='listbox'
                    aria-label={ariaLabel}
                >
                    {options.map(option => {
                        const isSelected =
                            option.value === value;

                        return (
                            <button
                                key={option.value}
                                type='button'
                                role='option'
                                aria-selected={isSelected}
                                className={[
                                    'minitigerSelectDropdownOption',
                                    isSelected ? 'isSelected' : ''
                                ].filter(Boolean).join(' ')}
                                onClick={() => {
                                    onChange(option.value);
                                    setOpen(false);
                                }}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MinitigerSelectDropdown;
