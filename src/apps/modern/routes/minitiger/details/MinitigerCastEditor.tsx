import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { useApi } from 'hooks/useApi';

import {
    resetMinitigerCastPreference,
    setMinitigerCastPreference,
    type MinitigerCastPreferenceState
} from '../home/community';

interface CastPerson {
    Id?: string | null;
    Name?: string | null;
    Role?: string | null;
    Type?: string | null;
}

interface MinitigerCastEditorProps {
    itemId?: string | null;
    people: CastPerson[];
    preference: MinitigerCastPreferenceState;
    onSaved: (state: MinitigerCastPreferenceState) => void;
}

const personLabel = (person: CastPerson) => {
    const bits = [
        person.Type,
        person.Role
    ].filter(Boolean);

    return bits.length > 0
        ? bits.join(' · ')
        : 'Mitwirkende Person';
};

const MinitigerCastEditor = ({
    itemId,
    people,
    preference,
    onSaved
}: MinitigerCastEditorProps) => {
    const { __legacyApiClient__: apiClient } = useApi();
    const [ open, setOpen ] = useState(false);
    const [ selectedIds, setSelectedIds ] = useState<string[]>([]);
    const [ saving, setSaving ] = useState(false);
    const [ status, setStatus ] = useState('');

    const selectablePeople = useMemo(
        () => people.filter(person => Boolean(person.Id)),
        [people]
    );

    useEffect(() => {
        if (!open) {
            return;
        }

        setSelectedIds(
            preference.enabled
                ? [ ...preference.selectedIds ]
                : []
        );
        setStatus('');
    }, [open, preference.enabled, preference.selectedIds]);

    const selectedSet = useMemo(
        () => new Set(selectedIds),
        [selectedIds]
    );

    const toggle = (id: string) => {
        setSelectedIds(current =>
            current.includes(id)
                ? current.filter(value => value !== id)
                : [ ...current, id ]
        );
    };

    const save = async () => {
        if (
            !apiClient
            || !itemId
            || selectedIds.length === 0
            || saving
        ) {
            return;
        }

        setSaving(true);
        setStatus('Cast-Auswahl wird gespeichert …');

        try {
            const next = await setMinitigerCastPreference(
                apiClient,
                itemId,
                selectedIds
            );
            onSaved(next);
            setStatus('Gespeichert.');
            setOpen(false);
        } catch (error) {
            setStatus(
                error instanceof Error
                    ? error.message
                    : String(error)
            );
        } finally {
            setSaving(false);
        }
    };

    const reset = async () => {
        if (!apiClient || !itemId || saving) {
            return;
        }

        setSaving(true);
        setStatus('Jellyfin-Standard wird wiederhergestellt …');

        try {
            await resetMinitigerCastPreference(
                apiClient,
                itemId
            );
            const next = {
                enabled: false,
                selectedIds: []
            };
            onSaved(next);
            setSelectedIds([]);
            setStatus('Jellyfin-Standard ist wieder aktiv.');
            setOpen(false);
        } catch (error) {
            setStatus(
                error instanceof Error
                    ? error.message
                    : String(error)
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <button
                type='button'
                className='minitigerCastEditButton'
                onClick={() => setOpen(true)}
                title='Angezeigten Cast auswählen'
            >
                Cast auswählen
            </button>

            {open && createPortal(
                <div
                    className='minitigerCastEditorLayer'
                    role='presentation'
                    onMouseDown={event => {
                        if (
                            event.target === event.currentTarget
                            && !saving
                        ) {
                            setOpen(false);
                        }
                    }}
                >
                    <section
                        className='minitigerCastEditorDialog'
                        role='dialog'
                        aria-modal='true'
                        aria-label='Cast auswählen'
                    >
                        <header>
                            <div>
                                <small>Admin · Detailpage</small>
                                <h2>Cast auswählen</h2>
                            </div>
                            <button
                                type='button'
                                onClick={() => setOpen(false)}
                                disabled={saving}
                                aria-label='Schließen'
                            >
                                ×
                            </button>
                        </header>

                        <p className='minitigerCastEditorHint'>
                            Solange keine manuelle Auswahl gespeichert ist, zeigt Minitiger weiterhin den kompletten Jellyfin-Cast. Erst ab mindestens einer ausgewählten Person greift diese Liste.
                        </p>

                        <div className='minitigerCastEditorToolbar'>
                            <button
                                type='button'
                                onClick={() => setSelectedIds(
                                    selectablePeople
                                        .map(person => String(person.Id ?? ''))
                                        .filter(Boolean)
                                )}
                            >
                                Alle auswählen
                            </button>
                            <button
                                type='button'
                                onClick={() => setSelectedIds([])}
                            >
                                Alle abwählen
                            </button>
                            <button
                                type='button'
                                onClick={() => setSelectedIds(
                                    selectablePeople
                                        .map(person => String(person.Id ?? ''))
                                        .filter(id => !selectedSet.has(id))
                                )}
                            >
                                Auswahl umkehren
                            </button>
                        </div>

                        <div className='minitigerCastEditorList'>
                            {selectablePeople.map(person => {
                                const id = String(person.Id);
                                return (
                                    <label key={id}>
                                        <input
                                            type='checkbox'
                                            checked={selectedSet.has(id)}
                                            onChange={() => toggle(id)}
                                        />
                                        <span>
                                            <strong>{person.Name ?? 'Unbekannt'}</strong>
                                            <small>{personLabel(person)}</small>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>

                        {status && (
                            <p className='minitigerCastEditorStatus'>
                                {status}
                            </p>
                        )}

                        <footer>
                            <button
                                type='button'
                                onClick={() => {
                                    void reset();
                                }}
                                disabled={saving || !preference.enabled}
                            >
                                Auf Jellyfin-Standard zurücksetzen
                            </button>

                            <div>
                                <button
                                    type='button'
                                    onClick={() => setOpen(false)}
                                    disabled={saving}
                                >
                                    Abbrechen
                                </button>
                                <button
                                    type='button'
                                    className='isPrimary'
                                    onClick={() => {
                                        void save();
                                    }}
                                    disabled={
                                        saving
                                        || selectedIds.length === 0
                                    }
                                >
                                    Auswahl speichern
                                </button>
                            </div>
                        </footer>
                    </section>
                </div>,
                document.body
            )}
        </>
    );
};

export default MinitigerCastEditor;

// MINITIGER_PATCH_MARKER: CAST_EDITOR_V1
