import React, { useEffect, useRef, useState } from 'react';

export interface MinitigerSelectOption {
    value: string;
    label: string;
    key?: string;
}

type MinitigerSelectDropdownVariant =
    | 'default'
    | 'season';

interface Props {
    value: string;
    options: MinitigerSelectOption[];
    onChange: (value: string) => void;
    disabled?: boolean;
    ariaLabel?: string;
    className?: string;
    variant?: MinitigerSelectDropdownVariant;
    fallbackLabel?: string;
    fallbackToFirstOption?: boolean;
}

const MinitigerSelectDropdown = ({
    value,
    options,
    onChange,
    disabled = false,
    ariaLabel = 'Auswahl',
    className,
    variant = 'default',
    fallbackLabel = 'Auswahl',
    fallbackToFirstOption = true
}: Props) => {
    const [ open, setOpen ] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const selected =
        options.find(option => option.value === value)
        ?? (fallbackToFirstOption ? options[0] : undefined);

    const isSeason = variant === 'season';
    const classNames = isSeason
        ? {
            root: 'minitigerSeasonDropdown',
            button: 'minitigerSeasonDropdownButton',
            value: '',
            chevron: 'minitigerSeasonDropdownChevron',
            menu: 'minitigerSeasonDropdownMenu',
            option: 'minitigerSeasonDropdownOption'
        }
        : {
            root: 'minitigerSelectDropdown',
            button: 'minitigerSelectDropdownButton',
            value: 'minitigerSelectDropdownValue',
            chevron: 'minitigerSelectDropdownChevron',
            menu: 'minitigerSelectDropdownMenu',
            option: 'minitigerSelectDropdownOption'
        };

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
                classNames.root,
                open ? 'isOpen' : '',
                className ?? ''
            ].filter(Boolean).join(' ')}
        >
            <button
                type='button'
                className={classNames.button}
                aria-label={ariaLabel}
                aria-haspopup='listbox'
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen(current => !current)}
            >
                <span className={classNames.value || undefined}>
                    {selected?.label ?? fallbackLabel}
                </span>
                <span
                    className={classNames.chevron}
                    aria-hidden='true'
                >
                    ▾
                </span>
            </button>

            {open && (
                <div
                    className={classNames.menu}
                    role='listbox'
                    aria-label={ariaLabel}
                >
                    {options.map(option => {
                        const isSelected =
                            option.value === value;

                        return (
                            <button
                                key={option.key ?? option.value}
                                type='button'
                                role='option'
                                aria-selected={isSelected}
                                className={[
                                    classNames.option,
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
