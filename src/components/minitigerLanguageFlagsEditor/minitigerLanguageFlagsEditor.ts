import type { ApiClient } from 'jellyfin-apiclient';

import {
    clearMinitigerLanguageFlags,
    getCachedMinitigerLanguageFlags,
    loadMinitigerLanguageFlagOverrides,
    MINITIGER_LANGUAGE_FLAG_OPTIONS,
    saveMinitigerLanguageFlags
} from 'apps/modern/routes/minitiger/home/minitigerLanguageFlags';
import {
    getLanguageFlagUrl
} from 'apps/modern/routes/minitiger/home/mediaUtils';
import dialogHelper from 'components/dialogHelper/dialogHelper';
import toast from 'components/toast/toast';

interface ItemLike {
    Id?: string | null;
    Name?: string | null;
}

const makeFlagRow = (
    language: {
        code: string;
        name: string;
    },
    selected: boolean
) => {
    const label =
        document.createElement(
            'label'
        );

    label.className =
        'minitigerLanguageFlagChoice';

    const input =
        document.createElement(
            'input'
        );

    input.type = 'checkbox';
    input.value = language.name;
    input.checked = selected;
    input.className =
        'minitigerLanguageFlagCheckbox';

    const flag =
        document.createElement(
            'img'
        );

    flag.src =
        getLanguageFlagUrl(
            language.name
        )
        ?? '';
    flag.alt = '';
    flag.loading = 'lazy';

    const text =
        document.createElement(
            'span'
        );

    text.textContent =
        language.name;

    label.append(
        input,
        flag,
        text
    );

    return label;
};

export const showMinitigerLanguageFlagsEditor =
    async (
        apiClient: ApiClient,
        item: ItemLike
    ): Promise<boolean> => {
        if (!item.Id) {
            return false;
        }

        await loadMinitigerLanguageFlagOverrides(
            apiClient
        );

        const current =
            getCachedMinitigerLanguageFlags(
                item.Id
            );

        const selected =
            new Set(
                current
                ?? []
            );

        const dlg =
            dialogHelper.createDialog({
                size: 'small',
                removeOnClose: true,
                scrollY: true
            });

        dlg.classList.add(
            'formDialog',
            'minitigerLanguageFlagsDialog'
        );

        dlg.innerHTML = `
            <div class="formDialogHeader">
                <button
                    type="button"
                    class="headerButton headerButtonLeft btnCancel paper-icon-button-light"
                    aria-label="Schließen"
                    title="Schließen"
                >
                    <span class="material-icons">arrow_back</span>
                </button>
                <h3 class="formDialogHeaderTitle">
                    Sprachflaggen bearbeiten
                </h3>
            </div>

            <div class="formDialogContent smoothScrollY">
                <div class="dialogContentInner dialog-content-centered">
                    <p class="minitigerLanguageFlagsItemName"></p>

                    <p class="fieldDescription minitigerLanguageFlagsHint">
                        Manuelle Flaggen haben Vorrang vor automatisch erkannten Audio-Sprachen.
                        Mit „Automatisch verwenden“ wird der Override vollständig entfernt.
                    </p>

                    <div class="minitigerLanguageFlagsMode"></div>

                    <div class="minitigerLanguageFlagsGrid"></div>

                    <div class="minitigerLanguageFlagsActions">
                        <button
                            type="button"
                            class="raised button-submit block btnSave"
                        >
                            <span>Speichern</span>
                        </button>

                        <button
                            type="button"
                            class="raised block btnAutomatic"
                        >
                            <span>Automatisch verwenden</span>
                        </button>

                        <button
                            type="button"
                            class="raised block btnCancelBottom"
                        >
                            <span>Abbrechen</span>
                        </button>
                    </div>
                </div>
            </div>

            <style>
                .minitigerLanguageFlagsDialog .dialogContentInner {
                    max-width: 44rem;
                }

                .minitigerLanguageFlagsItemName {
                    margin: 0 0 .45rem;
                    font-size: 1.12rem;
                    font-weight: 800;
                    color: #f2f2f2;
                }

                .minitigerLanguageFlagsHint {
                    margin-bottom: 1rem;
                }

                .minitigerLanguageFlagsMode {
                    margin: 0 0 1rem;
                    padding: .7rem .85rem;
                    border-radius: .4rem;
                    background: rgba(255,255,255,.055);
                    font-size: .9rem;
                }

                .minitigerLanguageFlagsGrid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
                    gap: .5rem;
                }

                .minitigerLanguageFlagChoice {
                    display: flex;
                    align-items: center;
                    gap: .65rem;
                    min-height: 2.8rem;
                    padding: .45rem .65rem;
                    border: 1px solid rgba(255,255,255,.10);
                    border-radius: .4rem;
                    background: rgba(255,255,255,.035);
                    cursor: pointer;
                    user-select: none;
                }

                .minitigerLanguageFlagChoice:hover {
                    background: rgba(255,255,255,.075);
                }

                .minitigerLanguageFlagChoice input {
                    width: 1.1rem;
                    height: 1.1rem;
                    margin: 0;
                }

                .minitigerLanguageFlagChoice img {
                    width: 1.8rem;
                    height: 1.15rem;
                    object-fit: cover;
                    border-radius: 2px;
                    box-shadow: 0 1px 5px rgba(0,0,0,.55);
                }

                .minitigerLanguageFlagChoice span {
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .minitigerLanguageFlagsActions {
                    display: grid;
                    gap: .55rem;
                    margin-top: 1.25rem;
                }
            </style>
        `;

        const itemName =
            dlg.querySelector<HTMLElement>(
                '.minitigerLanguageFlagsItemName'
            );

        if (itemName) {
            itemName.textContent =
                item.Name
                ?? 'Inhalt';
        }

        const mode =
            dlg.querySelector<HTMLElement>(
                '.minitigerLanguageFlagsMode'
            );

        if (mode) {
            mode.textContent =
                current === undefined
                    ? 'Aktuell: Automatische Erkennung'
                    : current.length > 0
                        ? `Aktuell manuell: ${current.join(', ')}`
                        : 'Aktuell manuell: Keine Flaggen';
        }

        const grid =
            dlg.querySelector<HTMLElement>(
                '.minitigerLanguageFlagsGrid'
            );

        MINITIGER_LANGUAGE_FLAG_OPTIONS
            .forEach(language => {
                grid?.append(
                    makeFlagRow(
                        language,
                        selected.has(
                            language.name
                        )
                    )
                );
            });

        const automaticButton =
            dlg.querySelector<HTMLButtonElement>(
                '.btnAutomatic'
            );

        if (automaticButton) {
            automaticButton.disabled =
                current === undefined;
        }

        return await new Promise<boolean>(
            resolve => {
                let changed = false;
                let settled = false;

                const finish = () => {
                    if (settled) {
                        return;
                    }

                    settled = true;
                    resolve(changed);
                };

                dlg.addEventListener(
                    'close',
                    finish,
                    {
                        once: true
                    }
                );

                const close = () => {
                    dialogHelper.close(
                        dlg
                    );
                };

                dlg.querySelector(
                    '.btnCancel'
                )?.addEventListener(
                    'click',
                    close
                );

                dlg.querySelector(
                    '.btnCancelBottom'
                )?.addEventListener(
                    'click',
                    close
                );

                dlg.querySelector(
                    '.btnSave'
                )?.addEventListener(
                    'click',
                    async () => {
                        const saveButton =
                            dlg.querySelector<HTMLButtonElement>(
                                '.btnSave'
                            );

                        try {
                            if (saveButton) {
                                saveButton.disabled = true;
                            }

                            const languages =
                                Array.from(
                                    dlg.querySelectorAll<HTMLInputElement>(
                                        '.minitigerLanguageFlagCheckbox:checked'
                                    )
                                ).map(
                                    input =>
                                        input.value
                                );

                            await saveMinitigerLanguageFlags(
                                apiClient,
                                item.Id as string,
                                languages
                            );

                            changed = true;

                            toast(
                                languages.length > 0
                                    ? `Sprachflaggen gespeichert: ${languages.join(', ')}`
                                    : 'Manueller Override gespeichert: keine Flaggen.'
                            );

                            close();
                        } catch (error) {
                            console.error(
                                '[Minitiger LanguageFlags] Speichern fehlgeschlagen',
                                error
                            );

                            toast(
                                error instanceof Error
                                    ? error.message
                                    : 'Sprachflaggen konnten nicht gespeichert werden.'
                            );

                            if (saveButton) {
                                saveButton.disabled = false;
                            }
                        }
                    }
                );

                automaticButton?.addEventListener(
                    'click',
                    async () => {
                        try {
                            automaticButton.disabled =
                                true;

                            await clearMinitigerLanguageFlags(
                                apiClient,
                                item.Id as string
                            );

                            changed = true;

                            toast(
                                'Automatische Sprachenerkennung ist wieder aktiv.'
                            );

                            close();
                        } catch (error) {
                            console.error(
                                '[Minitiger LanguageFlags] Override konnte nicht entfernt werden',
                                error
                            );

                            toast(
                                error instanceof Error
                                    ? error.message
                                    : 'Der Sprachflaggen-Override konnte nicht entfernt werden.'
                            );

                            automaticButton.disabled =
                                false;
                        }
                    }
                );

                dialogHelper.open(
                    dlg
                ).catch(() => {
                    close();
                });
            }
        );
    };

export default {
    show:
        showMinitigerLanguageFlagsEditor
};
