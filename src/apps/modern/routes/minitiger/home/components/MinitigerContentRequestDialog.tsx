import React, { useEffect, useState } from 'react';

import { useApi } from 'hooks/useApi';

import {
    MINITIGER_CONTENT_TYPES,
    submitMinitigerContentRequest,
    type MinitigerContentType
} from '../contentRequests';

import 'apps/modern/features/minitiger/MinitigerContentRequests.scss';

interface MinitigerContentRequestDialogProps {
    open: boolean;
    onClose: () => void;
}

const MinitigerContentRequestDialog = ({
    open,
    onClose
}: MinitigerContentRequestDialogProps) => {
    const {
        __legacyApiClient__: apiClient
    } = useApi();

    const [ title, setTitle ] = useState('');
    const [ contentType, setContentType ] =
        useState<MinitigerContentType>('Anime');
    const [ comment, setComment ] = useState('');
    const [ status, setStatus ] = useState('');
    const [ submitting, setSubmitting ] = useState(false);
    const [ sent, setSent ] = useState(false);

    useEffect(() => {
        if (!open) {
            return;
        }

        setStatus('');
        setSent(false);

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !submitting) {
                onClose();
            }
        };

        window.addEventListener('keydown', onKeyDown);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open, onClose, submitting]);

    if (!open) {
        return null;
    }

    const submit = async (
        event: React.FormEvent<HTMLFormElement>
    ) => {
        event.preventDefault();

        if (!apiClient || !title.trim() || submitting) {
            return;
        }

        setSubmitting(true);
        setStatus('Wunsch wird gesendet …');

        try {
            await submitMinitigerContentRequest(
                apiClient,
                {
                    title: title.trim(),
                    contentType,
                    comment: comment.trim()
                }
            );

            setSent(true);
            setStatus(
                'Dein Wunsch wurde an den Administrator gesendet. ♥'
            );
            setTitle('');
            setComment('');
            setContentType('Anime');
        } catch (error) {
            setStatus(
                error instanceof Error
                    ? error.message
                    : String(error)
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className='minitigerContentRequestLayer'
            role='presentation'
            onMouseDown={event => {
                if (
                    event.target === event.currentTarget
                    && !submitting
                ) {
                    onClose();
                }
            }}
        >
            <section
                className='minitigerContentRequestDialog'
                role='dialog'
                aria-modal='true'
                aria-labelledby='minitiger-content-request-title'
            >
                <header className='minitigerContentRequestHeader'>
                    <div>
                        <small>Minitiger</small>
                        <h2 id='minitiger-content-request-title'>
                            Wünsche
                        </h2>
                    </div>

                    <button
                        type='button'
                        className='minitigerContentRequestClose'
                        onClick={onClose}
                        disabled={submitting}
                        aria-label='Wünsche schließen'
                    >
                        ×
                    </button>
                </header>

                <form
                    className='minitigerContentRequestForm'
                    onSubmit={submit}
                >
                    <label>
                        <span>Titel</span>
                        <input
                            type='text'
                            value={title}
                            maxLength={180}
                            required
                            autoFocus
                            placeholder='Je genauer der Titel, desto besser …'
                            onChange={event =>
                                setTitle(
                                    event.currentTarget.value
                                )
                            }
                        />
                    </label>

                    <fieldset>
                        <legend>Art des Inhalts</legend>

                        <div className='minitigerContentRequestTypes'>
                            {MINITIGER_CONTENT_TYPES.map(type => (
                                <label
                                    key={type}
                                    className={
                                        contentType === type
                                            ? 'isSelected'
                                            : ''
                                    }
                                >
                                    <input
                                        type='radio'
                                        name='minitiger-content-type'
                                        value={type}
                                        checked={
                                            contentType === type
                                        }
                                        onChange={() =>
                                            setContentType(type)
                                        }
                                    />
                                    <span>{type}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <label>
                        <span>Kommentar <small>optional</small></span>
                        <textarea
                            value={comment}
                            maxLength={2000}
                            rows={5}
                            placeholder='Anmerkung, Version, Sprache oder sonstige Hinweise …'
                            onChange={event =>
                                setComment(
                                    event.currentTarget.value
                                )
                            }
                        />
                    </label>

                    {status && (
                        <div
                            className={[
                                'minitigerContentRequestStatus',
                                sent ? 'isSuccess' : ''
                            ].filter(Boolean).join(' ')}
                        >
                            {status}
                        </div>
                    )}

                    <div className='minitigerContentRequestActions'>
                        <button
                            type='button'
                            onClick={onClose}
                            disabled={submitting}
                        >
                            Schließen
                        </button>

                        <button
                            type='submit'
                            className='isPrimary'
                            disabled={
                                submitting
                                || !title.trim()
                                || !apiClient
                            }
                        >
                            {submitting
                                ? 'Wird gesendet …'
                                : 'Absenden'}
                        </button>
                    </div>
                </form>
            </section>
        </div>
    );
};

export default MinitigerContentRequestDialog;

// MINITIGER_PATCH_MARKER: CONTENT_REQUEST_DIALOG_V1
