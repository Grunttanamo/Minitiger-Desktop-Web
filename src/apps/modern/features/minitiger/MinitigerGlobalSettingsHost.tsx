import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import 'apps/modern/routes/minitiger/home/MinitigerHome.scss';
import MinitigerSettingsPanel from 'apps/modern/routes/minitiger/home/components/MinitigerSettingsPanel';
import useMinitigerCustomRows from 'apps/modern/routes/minitiger/home/hooks/useMinitigerCustomRows';
import useMinitigerDetailSettings from 'apps/modern/routes/minitiger/home/hooks/useMinitigerDetailSettings';
import useMinitigerHomeSettings from 'apps/modern/routes/minitiger/home/hooks/useMinitigerHomeSettings';
import useMinitigerLibrarySettings from 'apps/modern/routes/minitiger/home/hooks/useMinitigerLibrarySettings';
import useMinitigerThemeVariables from 'apps/modern/routes/minitiger/home/hooks/useMinitigerThemeVariables';
import useMinitigerVirtualLibraries from 'apps/modern/routes/minitiger/home/hooks/useMinitigerVirtualLibraries';
import { useUserViews } from 'hooks/api/useUserViews';
import { useApi } from 'hooks/useApi';
import type { ItemDto } from 'types/base/models/item-dto';

interface OpenSettingsHostProps {
    home: ReturnType<typeof useMinitigerHomeSettings>;
    onClose: () => void;
}

const OpenSettingsHost = ({
    home,
    onClose
}: OpenSettingsHostProps) => {
    const { user } = useApi();

    const isAdmin = Boolean(
        user?.Policy?.IsAdministrator
    );

    const {
        settings: librarySettings,
        updateSettings: updateLibrarySettings,
        resetSettings: resetLibrarySettings
    } = useMinitigerLibrarySettings();

    const {
        settings: detailSettings,
        updateSettings: updateDetailSettings,
        resetSettings: resetDetailSettings
    } = useMinitigerDetailSettings();

    const {
        config: customConfig,
        updateRow: updateCustomRow,
        replaceConfig: replaceCustomConfig,
        resetCustomRows
    } = useMinitigerCustomRows();

    const {
        config: virtualConfig,
        addLibrary: addVirtualLibrary,
        updateLibrary: updateVirtualLibrary,
        removeLibrary: removeVirtualLibrary,
        updateRowTitle: updateVirtualRowTitle,
        setRowTitleVisible: setVirtualRowTitleVisible,
        toggleRow: toggleVirtualRow,
        setHomeCardWidth: setVirtualHomeCardWidth,
        moveLibrary: moveVirtualLibrary,
        replaceConfig: replaceVirtualConfig
    } = useMinitigerVirtualLibraries();

    const {
        data: userViewsData
    } = useUserViews({
        userId: user?.Id
    });

    return (
        <MinitigerSettingsPanel
            settings={home.settings}
            librarySettings={librarySettings}
            detailSettings={detailSettings}
            customConfig={customConfig}
            libraries={
                (userViewsData?.Items ?? []) as ItemDto[]
            }
            onUpdate={home.updateSettings}
            onUpdateLibrarySettings={
                updateLibrarySettings
            }
            onUpdateDetailSettings={
                updateDetailSettings
            }
            onUpdateCustomRow={updateCustomRow}
            onReplaceCustomConfig={replaceCustomConfig}
            onToggleSection={home.toggleSection}
            onMoveHomeRow={home.moveHomeRow}
            onReorderHomeRows={home.reorderHomeRows}
            onReset={home.resetSettings}
            onResetLibrarySettings={
                resetLibrarySettings
            }
            onResetDetailSettings={
                resetDetailSettings
            }
            isAdmin={isAdmin}
            virtualConfig={virtualConfig}
            onAddVirtualLibrary={addVirtualLibrary}
            onUpdateVirtualLibrary={
                updateVirtualLibrary
            }
            onRemoveVirtualLibrary={
                removeVirtualLibrary
            }
            onMoveVirtualLibrary={moveVirtualLibrary}
            onReplaceVirtualConfig={
                replaceVirtualConfig
            }
            onUpdateVirtualRowTitle={
                updateVirtualRowTitle
            }
            onSetVirtualRowTitleVisible={
                setVirtualRowTitleVisible
            }
            onToggleVirtualRow={toggleVirtualRow}
            onSetVirtualHomeCardWidth={
                setVirtualHomeCardWidth
            }
            onResetCustomRows={resetCustomRows}
            onClose={onClose}
        />
    );
};

const MinitigerGlobalSettingsHost = () => {
    const location = useLocation();
    const [ open, setOpen ] = useState(false);

    /*
     * Keep only the lightweight Home/theme state alive globally so native
     * Minitiger cards retain their CSS variables. Expensive library/custom/
     * virtual hooks are mounted only while this overlay is actually open.
     */
    const home = useMinitigerHomeSettings();
    useMinitigerThemeVariables(home.settings);

    useEffect(() => {
        if (!window.NativeShell) {
            return;
        }

        const selector = [
            '.minitigerMediaCard',
            '.minitigerLibraryCard',
            '.minitigerVirtualHomeCard',
            '.minitigerNativeLibraryCard'
        ].join(',');

        const findCard = (target: EventTarget | null) =>
            target instanceof Element
                ? target.closest<HTMLElement>(selector)
                : null;

        const entered = (event: MouseEvent) => {
            const card = findCard(event.target);

            if (!card) {
                return;
            }

            const related = event.relatedTarget;

            if (
                related instanceof Node
                && card.contains(related)
            ) {
                return;
            }

            card.classList.add(
                'minitigerDesktopHover'
            );
        };

        const left = (event: MouseEvent) => {
            const card = findCard(event.target);

            if (!card) {
                return;
            }

            const related = event.relatedTarget;

            if (
                related instanceof Node
                && card.contains(related)
            ) {
                return;
            }

            card.classList.remove(
                'minitigerDesktopHover'
            );
        };

        document.addEventListener(
            'mouseover',
            entered
        );
        document.addEventListener(
            'mouseout',
            left
        );

        return () => {
            document.removeEventListener(
                'mouseover',
                entered
            );
            document.removeEventListener(
                'mouseout',
                left
            );

            document.querySelectorAll(
                '.minitigerDesktopHover'
            ).forEach(card => {
                card.classList.remove(
                    'minitigerDesktopHover'
                );
            });
        };
    }, []);

    useEffect(() => {
        const onOpen = () => {
            /*
             * /home owns its settings panel already, so let that instance
             * open there. Everywhere else this global host keeps the current
             * route mounted underneath the overlay.
             */
            if (location.pathname === '/home') {
                return;
            }

            setOpen(true);
        };

        window.addEventListener(
            'minitiger:open-settings',
            onOpen
        );

        return () => {
            window.removeEventListener(
                'minitiger:open-settings',
                onOpen
            );
        };
    }, [location.pathname]);

    useEffect(() => {
        const onCloseSettings = () => {
            setOpen(false);
        };

        window.addEventListener(
            'minitiger:close-settings',
            onCloseSettings
        );

        return () => {
            window.removeEventListener(
                'minitiger:close-settings',
                onCloseSettings
            );
        };
    }, []);

    if (!open) {
        return null;
    }

    return (
        <OpenSettingsHost
            home={home}
            onClose={() => setOpen(false)}
        />
    );
};

export default MinitigerGlobalSettingsHost;

// MINITIGER_PATCH_MARKER: PHASE_18_13_0_TEST_STABILITY_TRANSLATOR_BACKGROUND

// MINITIGER_PATCH_MARKER: PHASE_18_17_4_SETTINGS_CLOSE_ON_PROFILE_SWITCH
