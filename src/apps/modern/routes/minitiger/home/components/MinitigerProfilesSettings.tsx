import React, { useMemo, useState } from 'react';

import {
    MAX_MINITIGER_SUBPROFILES,
    type MinitigerProfile,
    type MinitigerProfileAvatarId
} from '../config/profiles';
import useMinitigerProfiles from '../hooks/useMinitigerProfiles';
import MinitigerConfirmDialog from './MinitigerConfirmDialog';
import MinitigerProfileAvatarPicker from './MinitigerProfileAvatarPicker';
import MinitigerProfileAvatarVisual from './MinitigerProfileAvatarVisual';
import '../MinitigerProfiles.scss';

type AvatarPickerTarget =
    | 'new'
    | string
    | null;

const MinitigerProfilesSettings = () => {
    const profiles = useMinitigerProfiles();

    const [ newName, setNewName ] = useState('');
    const [ newAvatar, setNewAvatar ] =
        useState<MinitigerProfileAvatarId>('fox');
    const [ newAvatarImage, setNewAvatarImage ] =
        useState('');
    const [
        avatarPickerTarget,
        setAvatarPickerTarget
    ] = useState<AvatarPickerTarget>(null);
    const [
        removeTarget,
        setRemoveTarget
    ] = useState<MinitigerProfile | null>(null);

    const newProfilePreview =
        useMemo<MinitigerProfile>(() => ({
            id: 'new-profile-preview',
            name: newName.trim() || 'Neues Profil',
            avatar: newAvatar,
            avatarImage: newAvatarImage,
            createdAt: '',
            isOwner: false
        }), [
            newAvatar,
            newAvatarImage,
            newName
        ]);

    const pickerProfile =
        avatarPickerTarget
        && avatarPickerTarget !== 'new'
            ? profiles.subProfiles.find(
                profile =>
                    profile.id === avatarPickerTarget
            ) ?? null
            : null;

    const createProfile = () => {
        if (profiles.addProfile(
            newName,
            newAvatar,
            newAvatarImage
        )) {
            setNewName('');
            setNewAvatar('fox');
            setNewAvatarImage('');
        }
    };

    const selectImage = (reference: string) => {
        if (avatarPickerTarget === 'new') {
            setNewAvatarImage(reference);
            return;
        }

        if (pickerProfile) {
            profiles.updateProfile(
                pickerProfile.id,
                {
                    avatarImage: reference
                }
            );
        }
    };

    const selectFallback = (
        avatar: MinitigerProfileAvatarId
    ) => {
        if (avatarPickerTarget === 'new') {
            setNewAvatar(avatar);
            setNewAvatarImage('');
            return;
        }

        if (pickerProfile) {
            profiles.updateProfile(
                pickerProfile.id,
                {
                    avatar,
                    avatarImage: ''
                }
            );
        }
    };

    const pickerCurrentProfile =
        avatarPickerTarget === 'new'
            ? newProfilePreview
            : pickerProfile;

    return (
        <>
            <h3>Profile</h3>

            <p className='minitigerSettingsIntro'>
                Persönliche Minitiger-Profile mit getrenntem
                Fortschritt, eigener Watchlist und eigenen
                Favoriten.
            </p>

            <section className='minitigerSettingsCard minitigerProfileOwnerCard'>
                <div className='minitigerProfileOwnerCardMain'>
                    <MinitigerProfileAvatarVisual
                        profile={profiles.ownerProfile}
                        className='minitigerProfileOwnerAvatar'
                    />

                    <div className='minitigerProfileOwnerText'>
                        <span className='minitigerProfileEyebrow'>
                            Hauptprofil
                        </span>
                        <strong>
                            {profiles.ownerProfile.name}
                        </strong>
                        <small>
                            Dein normales Jellyfin-Konto.
                            Das Bild wird automatisch aus
                            deinem Minitiger Custom Avatar
                            übernommen.
                        </small>
                    </div>
                </div>

                {profiles.hasSubprofiles && (
                    <button
                        type='button'
                        className='minitigerProfileSwitchButton'
                        onClick={profiles.requestSelection}
                    >
                        Profile wechseln
                    </button>
                )}
            </section>

            {!profiles.canManageProfiles && (
                <section className='minitigerSettingsCard minitigerProfileOwnerOnlyNotice'>
                    <h4>Profilverwaltung</h4>
                    <p className='minitigerSettingsHint'>
                        Namen, Bilder und Unterprofile können
                        nur im Hauptprofil verwaltet werden.
                        Über „Wer schaut gerade?“ kannst du
                        jederzeit ohne Passwort zurück zum
                        Hauptprofil wechseln.
                    </p>
                </section>
            )}

            {profiles.canManageProfiles && (
                <section className='minitigerSettingsCard'>
                    <div className='minitigerProfileSectionHeading'>
                        <div>
                            <h4>Unterprofil hinzufügen</h4>
                            <p className='minitigerSettingsHint'>
                                Bis zu {MAX_MINITIGER_SUBPROFILES}
                                {' '}Unterprofile pro Hauptaccount.
                            </p>
                        </div>

                        <span className='minitigerProfileCount'>
                            {profiles.subProfiles.length}
                            {' / '}
                            {MAX_MINITIGER_SUBPROFILES}
                        </span>
                    </div>

                    <div className='minitigerProfileCreateCard'>
                        <button
                            type='button'
                            className='minitigerProfileAvatarEditButton'
                            onClick={() =>
                                setAvatarPickerTarget('new')
                            }
                        >
                            <MinitigerProfileAvatarVisual
                                profile={newProfilePreview}
                            />
                            <span>Avatar wählen</span>
                        </button>

                        <label className='minitigerSettingsField minitigerProfileNameField'>
                            <span>Name</span>
                            <input
                                value={newName}
                                maxLength={28}
                                placeholder='z. B. Schwester'
                                onChange={event =>
                                    setNewName(
                                        event.currentTarget.value
                                    )
                                }
                                onKeyDown={event => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        createProfile();
                                    }
                                }}
                            />
                        </label>

                        <button
                            type='button'
                            className='minitigerProfileAddButton'
                            disabled={
                                !newName.trim()
                                || !profiles.canAddProfile
                            }
                            onClick={createProfile}
                        >
                            Profil hinzufügen
                        </button>
                    </div>
                </section>
            )}

            {profiles.canManageProfiles
                && profiles.subProfiles.length > 0
                && (
                    <section className='minitigerSettingsCard'>
                        <h4>Unterprofile verwalten</h4>

                        <div className='minitigerProfileSettingsList'>
                            {profiles.subProfiles.map(profile => (
                                <article
                                    key={profile.id}
                                    className='minitigerProfileSettingsRow'
                                >
                                    <button
                                        type='button'
                                        className='minitigerProfileAvatarEditButton isCompact'
                                        title='Avatar ändern'
                                        onClick={() =>
                                            setAvatarPickerTarget(
                                                profile.id
                                            )
                                        }
                                    >
                                        <MinitigerProfileAvatarVisual
                                            profile={{
                                                ...profile,
                                                isOwner: false
                                            }}
                                        />
                                        <span>Ändern</span>
                                    </button>

                                    <label className='minitigerSettingsField'>
                                        <span>Profilname</span>
                                        <input
                                            key={`${profile.id}:${profile.name}`}
                                            defaultValue={profile.name}
                                            maxLength={28}
                                            aria-label='Profilname'
                                            onBlur={event =>
                                                profiles.updateProfile(
                                                    profile.id,
                                                    {
                                                        name:
                                                            event.currentTarget.value
                                                    }
                                                )
                                            }
                                        />
                                    </label>

                                    <div className='minitigerProfileRowInfo'>
                                        <strong>
                                            Eigenes Profil
                                        </strong>
                                        <small>
                                            Fortschritt, Favoriten,
                                            Watchlist und „Als Nächstes“
                                            bleiben getrennt.
                                        </small>
                                    </div>

                                    <button
                                        type='button'
                                        className='minitigerProfileRemoveButton'
                                        onClick={() => {
                                            setRemoveTarget(profile);
                                        }}
                                    >
                                        Entfernen
                                    </button>
                                </article>
                            ))}
                        </div>
                    </section>
                )}

            <section className='minitigerSettingsCard minitigerProfileTestNotice'>
                <h4>Passwortlose Minitiger-Profile</h4>
                <p className='minitigerSettingsHint'>
                    Unterprofile besitzen eine getrennte
                    Jellyfin-Identität, bleiben aber komplett
                    hinter der Minitiger-Oberfläche verborgen.
                    Ein zusätzliches Passwort ist nicht nötig.
                </p>
            </section>

            <MinitigerConfirmDialog
                open={Boolean(removeTarget)}
                title='Unterprofil löschen?'
                confirmLabel='Profil löschen'
                danger
                onCancel={() => setRemoveTarget(null)}
                onConfirm={() => {
                    if (!removeTarget) {
                        return;
                    }

                    profiles.removeProfile(
                        removeTarget.id
                    );
                    setRemoveTarget(null);
                }}
            >
                <p>
                    Das Profil <strong>„{removeTarget?.name ?? ''}“</strong> wird
                    dauerhaft aus Minitiger entfernt.
                </p>

                <div className='minitigerConfirmNotice'>
                    Der getrennte Wiedergabefortschritt, die Watchlist und die
                    Profildaten dieses Unterprofils werden ebenfalls entfernt.
                </div>
            </MinitigerConfirmDialog>

            {avatarPickerTarget
                && pickerCurrentProfile
                && (
                    <MinitigerProfileAvatarPicker
                        currentImage={
                            pickerCurrentProfile.avatarImage
                        }
                        currentFallback={
                            pickerCurrentProfile.avatar
                        }
                        onSelectImage={selectImage}
                        onSelectFallback={selectFallback}
                        onClose={() =>
                            setAvatarPickerTarget(null)
                        }
                    />
                )}
        </>
    );
};

export default MinitigerProfilesSettings;

// MINITIGER_PATCH_MARKER: PHASE_18_17_1_PROFILE_SETTINGS
// MINITIGER_PATCH_MARKER: PHASE_18_17_3_PROFILE_SETTINGS_POLISH
