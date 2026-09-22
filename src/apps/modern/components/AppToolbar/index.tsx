import Button from '@mui/material/Button/Button';
import Stack from '@mui/material/Stack';
import React, { type FC } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { appRouter, PUBLIC_PATHS } from 'components/router/appRouter';
import BaseToolbar from 'components/toolbar/AppToolbar';

import RemotePlayButton from './RemotePlayButton';
import SyncPlayButton from './SyncPlayButton';
import SearchButton from './SearchButton';
import useMinitigerToolbarBranding from '../../routes/minitiger/home/hooks/useMinitigerToolbarBranding';
import minitigerDefaultLogo from '../../../../assets/img/minitiger-logo.webp';

interface AppToolbarProps {
    isDrawerAvailable: boolean
    isDrawerOpen: boolean
    onDrawerButtonClick: (event: React.MouseEvent<HTMLElement>) => void
}

const AppToolbar: FC<AppToolbarProps> = ({
    isDrawerAvailable,
    isDrawerOpen,
    onDrawerButtonClick
}) => {
    const location = useLocation();
    const toolbarBranding =
        useMinitigerToolbarBranding();

    if (location.pathname === '/video') return null;

    const isBackButtonAvailable = window.NativeShell && appRouter.canGoBack(location.pathname);
    const isPublicPath = PUBLIC_PATHS.includes(location.pathname);
    const customToolbarBrandLogoSource =
        toolbarBranding.image.trim();
    const usesCustomToolbarBranding =
        toolbarBranding.enabled
        && Boolean(customToolbarBrandLogoSource);
    const toolbarBrandLogoSource =
        usesCustomToolbarBranding
            ? customToolbarBrandLogoSource
            : minitigerDefaultLogo;
    const toolbarBrandLogoSize =
        usesCustomToolbarBranding
            ? toolbarBranding.size
            : 44;
    const showsMinitigerBranding =
        !isPublicPath;

    return (
        <BaseToolbar
            buttons={!isPublicPath && (
                <>
                    <button
                        type='button'
                        title='Minitiger Einstellungen'
                            aria-label='Minitiger Einstellungen'
                            onClick={() => {
                                window.dispatchEvent(
                                    new CustomEvent(
                                        'minitiger:open-settings'
                                    )
                                );
                            }}
                            style={{
                                width: '2.5rem',
                                height: '2.5rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 0,
                                border: 0,
                                background: 'transparent',
                                color: 'inherit',
                                borderRadius: '50%',
                                fontSize: '1.25rem',
                                cursor: 'pointer',
                                alignSelf: 'center',
                                margin: 0,
                                lineHeight: 1
                            }}
                        >
                            <span
                                aria-hidden='true'
                                style={{
                                    display: 'block',
                                    lineHeight: 1,
                                    transform: 'translateY(1px)'
                                }}
                            >
                                ⚙
                            </span>
                    </button>
                    <SyncPlayButton />
                    <RemotePlayButton />
                    <SearchButton />
                </>
            )}
            isDrawerAvailable={isDrawerAvailable}
            isDrawerOpen={isDrawerOpen}
            onDrawerButtonClick={onDrawerButtonClick}
            isBackButtonAvailable={isBackButtonAvailable}
            isUserMenuAvailable={!isPublicPath}
            className='padded-left padded-right'
        >
            <Stack
                direction='row'
                spacing={0.5}
                alignItems='center'
                sx={{ minWidth: 0 }}
            >
                {!isDrawerAvailable && showsMinitigerBranding && (
                    <Button
                        data-minitiger-toolbar-brand
                        variant='text'
                        size='large'
                        color='inherit'
                        component={Link}
                        to='/'
                        aria-label='Startseite'
                        sx={{
                            minWidth: 0,
                            maxWidth: '24rem',
                            padding: '0.2rem 0.45rem',
                            gap: '0.5rem',
                            textTransform: 'none',
                            overflow: 'hidden'
                        }}
                    >
                        <img
                            key={toolbarBrandLogoSource}
                            src={toolbarBrandLogoSource}
                            alt=''
                            aria-hidden='true'
                            style={{
                                width: 'auto',
                                height: `${toolbarBrandLogoSize}px`,
                                maxWidth: '15rem',
                                flex: '0 1 auto',
                                objectFit: 'contain'
                            }}
                            onError={event => {
                                event.currentTarget.style.display = 'none';
                            }}
                        />

                    </Button>
                )}

            </Stack>
        </BaseToolbar>

        /* MINITIGER_PATCH_MARKER: PHASE_18_8_2_TEST_CUSTOM_HEADER_BRANDING */
        /* MINITIGER_PATCH_MARKER: PHASE_18_8_3_TEST_HEADER_BRANDING_V2 */
        /* MINITIGER_PATCH_MARKER: PHASE_18_8_4B_TEST_LOGO_ONLY_SAFE */
        /* MINITIGER_PATCH_MARKER: PHASE_18_12_0_TEST_USER_MENU_PROFILE_INTEGRATION */
        /* MINITIGER_PATCH_MARKER: PHASE_18_12_2_TEST_USER_RECOVERY_IDB_STABILITY */
    );
};

export default AppToolbar;

// MINITIGER_PATCH_MARKER: PHASE_18_13_0_TEST_STABILITY_TRANSLATOR_BACKGROUND
