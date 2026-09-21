import React, { StrictMode, useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import { type Theme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Outlet, useLocation } from 'react-router-dom';

import AppBody from 'components/AppBody';
import CustomCss from 'components/CustomCss';
import layoutManager from 'components/layoutManager';
import OffsetAppBar from 'components/OffsetAppBar';
import ThemeCss from 'components/ThemeCss';
import { useApi } from 'hooks/useApi';

import AppToolbar from './components/AppToolbar';
import AppDrawer, { isDrawerPath } from './components/drawers/AppDrawer';
import LibraryToolbar from './features/libraries/components/LibraryToolbar';
import { LibraryProvider } from './features/libraries/hooks/useLibrary';
import { isLibraryPath } from './features/libraries/utils/path';
import MinitigerAdminMessageHost from './features/minitiger/MinitigerAdminMessageHost';
import MinitigerGlobalSettingsHost from './features/minitiger/MinitigerGlobalSettingsHost';
import MinitigerProfileSelectionHost from './features/minitiger/MinitigerProfileSelectionHost';

import './AppOverrides.scss';

export const Component = () => {
    const [ isDrawerActive, setIsDrawerActive ] = useState(false);
    const { user } = useApi();
    const location = useLocation();

    const isMediumScreen = useMediaQuery((t: Theme) => t.breakpoints.up('md'));
    const isDrawerAvailable = isDrawerPath(location.pathname) && Boolean(user) && !isMediumScreen;
    const isDrawerOpen = isDrawerActive && isDrawerAvailable;
    const isCurrentLibraryPath = isLibraryPath(location.pathname);

    useEffect(() => {
        console.info(
            '[Minitiger Desktop Compat] layout '
            + JSON.stringify({
                origin: window.location.origin,
                pathname: window.location.pathname,
                nativeShell: Boolean(window.NativeShell),
                desktop: layoutManager.desktop,
                mobile: layoutManager.mobile,
                tv: layoutManager.tv,
                modern: layoutManager.modern
            })
        );
    }, []);

    const onToggleDrawer = useCallback(() => {
        setIsDrawerActive(!isDrawerActive);
    }, [ isDrawerActive, setIsDrawerActive ]);

    return (
        <LibraryProvider>
            <Box
                sx={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%'
                }}
            >
                <StrictMode>
                    <OffsetAppBar
                        dense
                        forceTransparent={isCurrentLibraryPath}
                    >
                        <AppToolbar
                            isDrawerAvailable={!isMediumScreen && isDrawerAvailable}
                            isDrawerOpen={isDrawerOpen}
                            onDrawerButtonClick={onToggleDrawer}
                        />
                    </OffsetAppBar>

                    {isCurrentLibraryPath && (
                        <LibraryToolbar />
                    )}

                    {
                        isDrawerAvailable && (
                            <AppDrawer
                                open={isDrawerOpen}
                                onClose={onToggleDrawer}
                                onOpen={onToggleDrawer}
                            />
                        )
                    }
                </StrictMode>

                <Box
                    component='main'
                    sx={{
                        position: 'relative',
                        width: '100%',
                        flexGrow: 1
                    }}
                >
                    <AppBody>
                        <Outlet />
                    </AppBody>
                </Box>
            </Box>
            <MinitigerAdminMessageHost />
            <MinitigerGlobalSettingsHost />
            <MinitigerProfileSelectionHost />
            <ThemeCss />
            <CustomCss />
        </LibraryProvider>
    );
};

// MINITIGER_PATCH_MARKER: PHASE_18_17_4_GLOBAL_PROFILE_SELECTION_MOUNT
