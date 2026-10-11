import React, { useEffect, useState } from 'react';

import { useApi } from 'hooks/useApi';

import {
    clearMinitigerUserRating,
    getMinitigerUserRating,
    setMinitigerUserRating
} from '../home/community';

interface MinitigerUserRatingProps {
    itemId?: string | null;
}

const MinitigerUserRating = ({
    itemId
}: MinitigerUserRatingProps) => {
    const {
        __legacyApiClient__: apiClient
    } = useApi();

    const [ rating, setRating ] =
        useState<number | null>(null);
    const [ hoverRating, setHoverRating ] =
        useState<number | null>(null);
    const [ loading, setLoading ] = useState(false);
    const [ saving, setSaving ] = useState(false);
    const [ error, setError ] = useState('');

    useEffect(() => {
        if (!apiClient || !itemId) {
            setRating(null);
            setError('');
            return;
        }

        let active = true;
        setLoading(true);

        void getMinitigerUserRating(
            apiClient,
            itemId
        )
            .then(result => {
                if (!active) {
                    return;
                }

                setRating(
                    typeof result.rating === 'number'
                        ? result.rating
                        : null
                );
                setError('');
            })
            .catch(loadError => {
                if (!active) {
                    return;
                }

                console.warn(
                    '[Minitiger Rating] Bewertung konnte nicht geladen werden.',
                    loadError
                );
                setError(
                    loadError instanceof Error
                        ? loadError.message
                        : String(loadError)
                );
            })
            .finally(() => {
                if (active) {
                    setLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [apiClient, itemId]);

    if (!itemId) {
        return null;
    }

    const preview =
        hoverRating
        ?? rating
        ?? 0;

    const save = async (
        nextRating: number
    ) => {
        if (
            !apiClient
            || saving
        ) {
            return;
        }

        setSaving(true);

        try {
            const result =
                await setMinitigerUserRating(
                    apiClient,
                    itemId,
                    nextRating
                );

            setRating(result.rating);
            setError('');
        } catch (saveError) {
            setError(
                saveError instanceof Error
                    ? saveError.message
                    : String(saveError)
            );
        } finally {
            setSaving(false);
        }
    };

    const clear = async () => {
        if (
            !apiClient
            || saving
        ) {
            return;
        }

        setSaving(true);

        try {
            await clearMinitigerUserRating(
                apiClient,
                itemId
            );
            setRating(null);
            setHoverRating(null);
            setError('');
        } catch (clearError) {
            setError(
                clearError instanceof Error
                    ? clearError.message
                    : String(clearError)
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className={[
                'minitigerUserRating',
                loading ? 'isLoading' : '',
                saving ? 'isSaving' : ''
            ].filter(Boolean).join(' ')}
            onMouseLeave={() => {
                setHoverRating(null);
            }}
            title={
                error
                    || (
                        rating
                            ? 'Deine Bewertung: ' + rating + '/10'
                            : 'Deine Bewertung'
                    )
            }
        >
            <span className='minitigerUserRatingLabel'>
                Deine Bewertung
            </span>

            <span
                className='minitigerUserRatingStars'
                aria-label={
                    rating
                        ? 'Deine Bewertung ' + rating + ' von 10'
                        : 'Noch nicht bewertet'
                }
            >
                {Array.from(
                    { length: 10 },
                    (_, index) => {
                        const value =
                            index + 1;
                        const active =
                            value <= preview;

                        return (
                            <button
                                key={value}
                                type='button'
                                className={
                                    active
                                        ? 'isFilled'
                                        : ''
                                }
                                disabled={
                                    loading
                                    || saving
                                    || !apiClient
                                }
                                aria-label={value + ' von 10 Sternen'}
                                onMouseEnter={() => {
                                    setHoverRating(value);
                                }}
                                onFocus={() => {
                                    setHoverRating(value);
                                }}
                                onBlur={() => {
                                    setHoverRating(null);
                                }}
                                onClick={() => {
                                    void save(value);
                                }}
                            >
                                ★
                            </button>
                        );
                    }
                )}
            </span>

            {rating != null && (
                <button
                    type='button'
                    className='minitigerUserRatingClear'
                    disabled={saving}
                    onClick={() => {
                        void clear();
                    }}
                    title='Eigene Bewertung löschen'
                    aria-label='Eigene Bewertung löschen'
                >
                    ×
                </button>
            )}
        </div>
    );
};

export default MinitigerUserRating;

// MINITIGER_PATCH_MARKER: USER_RATING_STARS_V1
