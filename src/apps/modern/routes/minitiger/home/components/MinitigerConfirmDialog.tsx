import React, {
    type ReactNode,
    useEffect,
    useId
} from 'react';
import { createPortal } from 'react-dom';

import './MinitigerConfirmDialog.scss';

interface MinitigerConfirmDialogProps {
    open: boolean;
    title: string;
    children?: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const MinitigerConfirmDialog = ({
    open,
    title,
    children,
    confirmLabel = 'Bestätigen',
    cancelLabel = 'Abbrechen',
    danger = false,
    busy = false,
    onConfirm,
    onCancel
}: MinitigerConfirmDialogProps) => {
    const titleId = useId();

    useEffect(() => {
        if (!open) {
            return;
        }

        const onKeyDown = (
            event: KeyboardEvent
        ) => {
            if (
                event.key === 'Escape'
                && !busy
            ) {
                event.preventDefault();
                onCancel();
            }
        };

        document.addEventListener(
            'keydown',
            onKeyDown
        );

        return () => {
            document.removeEventListener(
                'keydown',
                onKeyDown
            );
        };
    }, [
        busy,
        onCancel,
        open
    ]);

    if (!open) {
        return null;
    }

    return createPortal(
        <div
            className='minitigerConfirmOverlay'
            role='presentation'
            onMouseDown={event => {
                if (
                    event.target === event.currentTarget
                    && !busy
                ) {
                    onCancel();
                }
            }}
        >
            <section
                className={
                    `minitigerConfirmDialog${
                        danger
                            ? ' isDanger'
                            : ''
                    }`
                }
                role='dialog'
                aria-modal='true'
                aria-labelledby={titleId}
            >
                <div className='minitigerConfirmGlow' />

                <div className='minitigerConfirmHeader'>
                    <span
                        className='minitigerConfirmIcon'
                        aria-hidden='true'
                    >
                        {danger ? '!' : '✓'}
                    </span>

                    <div>
                        <span className='minitigerConfirmEyebrow'>
                            Minitiger Bestätigung
                        </span>
                        <h3 id={titleId}>
                            {title}
                        </h3>
                    </div>
                </div>

                {children && (
                    <div className='minitigerConfirmBody'>
                        {children}
                    </div>
                )}

                <div className='minitigerConfirmActions'>
                    <button
                        type='button'
                        disabled={busy}
                        onClick={onCancel}
                    >
                        {cancelLabel}
                    </button>

                    <button
                        type='button'
                        className={
                            danger
                                ? 'isDanger'
                                : 'isPrimary'
                        }
                        disabled={busy}
                        onClick={onConfirm}
                    >
                        {busy
                            ? 'Bitte warten …'
                            : confirmLabel}
                    </button>
                </div>
            </section>
        </div>,
        document.body
    );
};

export default MinitigerConfirmDialog;
