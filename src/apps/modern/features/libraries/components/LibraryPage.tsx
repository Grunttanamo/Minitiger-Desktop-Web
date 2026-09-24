import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import React, { type FC, useEffect } from 'react';

import {
    getContrastTextColor
} from 'apps/modern/routes/minitiger/home/config/homeSettings';
import useMinitigerHomeSettings
    from 'apps/modern/routes/minitiger/home/hooks/useMinitigerHomeSettings';
import useMinitigerLibrarySettings
    from 'apps/modern/routes/minitiger/home/hooks/useMinitigerLibrarySettings';
import useMinitigerThemeVariables
    from 'apps/modern/routes/minitiger/home/hooks/useMinitigerThemeVariables';
import viewsByKind from 'apps/modern/features/libraries/constants/views';
import MinitigerPreviewLayer from 'apps/modern/features/minitiger/MinitigerPreviewLayer';
import Page from 'components/Page';
import useCurrentTab from 'hooks/useCurrentTab';

import PageTabContent from './PageTabContent';
import './MinitigerLibrary.scss';

interface LibraryPageProps {
    type: CollectionType
}

const PAGE_IDS: Record<CollectionType, string> = {
    [CollectionType.Books]: 'booksPage',
    [CollectionType.Boxsets]: 'boxsetsPage',
    [CollectionType.Folders]: 'foldersPage',
    [CollectionType.Homevideos]: 'homevideos',
    [CollectionType.Livetv]: 'liveTvPage',
    [CollectionType.Movies]: 'moviesPage',
    [CollectionType.Music]: 'musicPage',
    [CollectionType.Musicvideos]: 'musicvideos',
    [CollectionType.Photos]: 'photosPage',
    [CollectionType.Playlists]: 'playlistsPage',
    [CollectionType.Trailers]: 'trailersPage',
    [CollectionType.Tvshows]: 'tvshowsPage',
    [CollectionType.Unknown]: 'mixed'
};

const PAGE_BACKDROPS: Partial<Record<CollectionType, BaseItemKind[]>> = {
    [CollectionType.Boxsets]: [BaseItemKind.BoxSet],
    [CollectionType.Homevideos]: [
        BaseItemKind.Video,
        BaseItemKind.Photo
    ],
    [CollectionType.Movies]: [BaseItemKind.Movie],
    [CollectionType.Music]: [BaseItemKind.MusicArtist],
    [CollectionType.Musicvideos]: [BaseItemKind.MusicVideo],
    [CollectionType.Tvshows]: [BaseItemKind.Series],
    [CollectionType.Unknown]: [
        BaseItemKind.Movie,
        BaseItemKind.Series
    ]
};

const LibraryPage: FC<LibraryPageProps> = ({
    type
}) => {
    const {
        libraryId,
        activeTab
    } = useCurrentTab();

    const {
        settings
    } = useMinitigerHomeSettings();

    const {
        settings: librarySettings
    } = useMinitigerLibrarySettings();

    useMinitigerThemeVariables(settings);

    useEffect(() => {
        document.body.classList.add(
            'minitigerLibraryActive'
        );

        return () => {
            document.body.classList.remove(
                'minitigerLibraryActive'
            );
        };
    }, []);

    const currentTab = viewsByKind[type][activeTab];

    const pageStyle = {
        '--mt-accent': settings.accentColor,
        '--mt-accent-hover': settings.primaryHoverColor,
        '--mt-accent-text':
            getContrastTextColor(settings.accentColor),
        '--mt-library-bar': settings.libraryBarColor,
        '--mt-library-bar-text': settings.libraryBarTextColor,
        '--mt-glow-color': settings.glowColor,
        '--mt-glow-opacity': settings.glowStrength / 100,
        '--mt-glow-size': `${settings.glowSize}px`,
        '--mt-library-poster-width': `${librarySettings.posterSize}px`,
        '--mt-library-landscape-width': `${librarySettings.landscapeSize}px`,
        '--mt-library-content-gap': `${librarySettings.contentGap}px`
    } as React.CSSProperties;

    return (
        <Page
            id={PAGE_IDS[type]}
            className={
                'mainAnimatedPage libraryPage pageWithAbsoluteTabs '
                + 'withTabs minitigerLibraryPage'
            }
            backDropType={PAGE_BACKDROPS[type]}
            style={pageStyle}
            data-card-size={settings.cardSize}
            data-hover-enabled={settings.hoverEnabled}
            data-glow-enabled={settings.glowEnabled}
            data-show-played={settings.showPlayedIndicators}
            data-collection-type={type}
        >
            <PageTabContent
                key={`${currentTab.viewType}-${libraryId}`}
                currentTab={currentTab}
                parentId={libraryId}
            />

            {settings.previewEnabled && (
                <MinitigerPreviewLayer
                    accentColor={settings.accentColor}
                    accentTextColor={
                        getContrastTextColor(
                            settings.accentColor
                        )
                    }
                    seriesEnabled={settings.previewSeriesEnabled}
                    movieEnabled={settings.previewMovieEnabled}
                    mangaEnabled={settings.previewMangaEnabled}
                    trailerDownloadEnabled={settings.trailerDownloadEnabled}
                />
            )}
        </Page>
    );
};

export default LibraryPage;
