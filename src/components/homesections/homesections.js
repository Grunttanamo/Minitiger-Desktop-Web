import layoutManager from 'components/layoutManager';
import { DEFAULT_SECTIONS, HomeSectionType } from 'constants/homeSectionType';
import { getUserViewsQuery } from 'hooks/api/useUserViews';
import globalize from 'lib/globalize';
import ServerConnections from 'lib/jellyfin-apiclient/ServerConnections';
import Dashboard from 'utils/dashboard';
import { queryClient } from 'utils/query/queryClient';
import {
    broadcastMinitigerServerPreference,
    readMinitigerServerPreference
} from 'apps/modern/routes/minitiger/home/serverPreferences';

import { loadRecordings } from './sections/activeRecordings';
import { loadLibraryButtons } from './sections/libraryButtons';
import { loadLibraryTiles } from './sections/libraryTiles';
import { loadLiveTV } from './sections/liveTv';
import { loadNextUp } from './sections/nextUp';
import { loadRecentlyAdded } from './sections/recentlyAdded';
import { loadResume } from './sections/resume';

import 'elements/emby-button/paper-icon-button-light';
import 'elements/emby-itemscontainer/emby-itemscontainer';
import 'elements/emby-scroller/emby-scroller';
import 'elements/emby-button/emby-button';

import './homesections.scss';

const MAX_SECTIONS = 10;
const MAX_SECTIONS_TV = MAX_SECTIONS + 1; // TV layout can have an extra section to ensure a library section is always visible

const MINITIGER_LIBRARY_ORDER_PREF_KEY =
    'libraryOrder.v1';

const normalizeMinitigerLibraryOrder = value => (
    Array.isArray(value)
        ? Array.from(
            new Set(
                value
                    .map(id => String(id || '').trim())
                    .filter(Boolean)
            )
        )
        : []
);

const sortMinitigerUserViews = (
    userViews,
    order
) => {
    if (!order.length) {
        return userViews;
    }

    const positions =
        new Map(
            order.map(
                (id, index) => [ id, index ]
            )
        );

    return userViews
        .map((item, index) => ({
            item,
            index
        }))
        .sort((left, right) => {
            const leftPos =
                positions.get(left.item.Id);
            const rightPos =
                positions.get(right.item.Id);

            if (
                leftPos == null
                && rightPos == null
            ) {
                return left.index - right.index;
            }

            if (leftPos == null) {
                return 1;
            }

            if (rightPos == null) {
                return -1;
            }

            return leftPos - rightPos;
        })
        .map(entry => entry.item);
};

const applyMinitigerGlobalLibraryOrder = async (
    apiClient,
    user,
    userViews
) => {
    const userId =
        user?.Id
        || apiClient.getCurrentUserId();

    if (!userId) {
        return userViews;
    }

    if (user?.Policy?.IsAdministrator) {
        const configured =
            normalizeMinitigerLibraryOrder(
                user.Configuration?.OrderedViews
            );
        const visibleIds =
            normalizeMinitigerLibraryOrder(
                userViews.map(item => item.Id)
            );
        const canonical =
            normalizeMinitigerLibraryOrder([
                ...configured,
                ...visibleIds
            ]);

        const stored =
            normalizeMinitigerLibraryOrder(
                await readMinitigerServerPreference(
                    apiClient,
                    userId,
                    MINITIGER_LIBRARY_ORDER_PREF_KEY
                )
            );

        if (
            JSON.stringify(stored)
            !== JSON.stringify(canonical)
        ) {
            await broadcastMinitigerServerPreference(
                apiClient,
                MINITIGER_LIBRARY_ORDER_PREF_KEY,
                canonical
            );
        }

        return sortMinitigerUserViews(
            userViews,
            canonical
        );
    }

    const globalOrder =
        normalizeMinitigerLibraryOrder(
            await readMinitigerServerPreference(
                apiClient,
                userId,
                MINITIGER_LIBRARY_ORDER_PREF_KEY
            )
        );

    return sortMinitigerUserViews(
        userViews,
        globalOrder
    );
};

export function getDefaultSection(index) {
    if (index < 0 || index > DEFAULT_SECTIONS.length) return '';
    return DEFAULT_SECTIONS[index];
}

function getAllSectionsToShow(userSettings) {
    const sections = [];
    for (let i = 0, length = MAX_SECTIONS; i < length; i++) {
        let section = userSettings.get('homesection' + i) || getDefaultSection(i);
        if (section === 'folders') {
            section = getDefaultSection(0);
        }

        sections.push(section);
    }

    // Ensure libraries are visible in TV layout
    if (
        layoutManager.tv
            && !sections.includes(HomeSectionType.SmallLibraryTiles)
            && !sections.includes(HomeSectionType.LibraryButtons)
    ) {
        return [
            HomeSectionType.SmallLibraryTiles,
            ...sections
        ];
    }

    return sections;
}

export function loadSections(elem, apiClient, user, userSettings) {
    const api = ServerConnections.getApi(apiClient.serverId());
    const userId = user.Id || apiClient.getCurrentUserId();
    return queryClient
        .fetchQuery(getUserViewsQuery(api, { userId }))
        .then(result => result.Items || [])
        .then(userViews =>
            applyMinitigerGlobalLibraryOrder(
                apiClient,
                user,
                userViews
            )
        )
        .then(function (userViews) {
            let html = '';

            if (userViews.length) {
                // TV layout can have an extra section to ensure libraries are visible
                const totalSectionCount = layoutManager.tv ? MAX_SECTIONS_TV : MAX_SECTIONS;
                for (let i = 0; i < totalSectionCount; i++) {
                    html += '<div class="verticalSection section' + i + '"></div>';
                }

                elem.innerHTML = html;
                elem.classList.add('homeSectionsContainer');

                const promises = getAllSectionsToShow(userSettings)
                    .map((section, index) => (
                        loadSection(elem, apiClient, user, userSettings, userViews, section, index)
                    ));

                return Promise.all(promises)
                    // Timeout for polyfilled CustomElements (webOS 1.2)
                    .then(() => new Promise((resolve) => setTimeout(resolve, 0)))
                    .then(() => resume(elem, { refresh: true }));
            } else {
                let noLibDescription;
                if (user.Policy?.IsAdministrator) {
                    noLibDescription = globalize.translate('NoCreatedLibraries', '<br><a id="button-createLibrary" class="button-link">', '</a>');
                } else {
                    noLibDescription = globalize.translate('AskAdminToCreateLibrary');
                }

                html += '<div class="centerMessage padded-left padded-right">';
                html += '<h2>' + globalize.translate('MessageNothingHere') + '</h2>';
                html += '<p>' + noLibDescription + '</p>';
                html += '</div>';
                elem.innerHTML = html;

                const createNowLink = elem.querySelector('#button-createLibrary');
                if (createNowLink) {
                    createNowLink.addEventListener('click', function () {
                        Dashboard.navigate('dashboard/libraries');
                    });
                }
            }
        });
}

export function destroySections(elem) {
    const elems = elem.querySelectorAll('.itemsContainer');
    for (const e of elems) {
        e.fetchData = null;
        e.parentContainer = null;
        e.getItemsHtml = null;
    }

    elem.innerHTML = '';
}

export function pause(elem) {
    const elems = elem.querySelectorAll('.itemsContainer');
    for (const e of elems) {
        e.pause();
    }
}

export function resume(elem, options) {
    const elems = elem.querySelectorAll('.itemsContainer');
    const promises = [];

    Array.prototype.forEach.call(elems, section => {
        if (section.resume) {
            promises.push(section.resume(options));
        }
    });

    return Promise.all(promises);
}

function loadSection(page, apiClient, user, userSettings, userViews, section, index) {
    const elem = page.querySelector('.section' + index);
    const options = { enableOverflow: enableScrollX() };

    switch (section) {
        case HomeSectionType.ActiveRecordings:
            loadRecordings(elem, true, apiClient, options);
            break;
        case HomeSectionType.LatestMedia:
            loadRecentlyAdded(elem, apiClient, user, userViews, options);
            break;
        case HomeSectionType.LibraryButtons:
            loadLibraryButtons(elem, userViews);
            break;
        case HomeSectionType.LiveTv:
            return loadLiveTV(elem, apiClient, user, options);
        case HomeSectionType.NextUp:
            loadNextUp(elem, apiClient, userSettings, options);
            break;
        case HomeSectionType.Resume:
            loadResume(elem, apiClient, 'HeaderContinueWatching', 'Video', userSettings, options);
            break;
        case HomeSectionType.ResumeAudio:
            loadResume(elem, apiClient, 'HeaderContinueListening', 'Audio', userSettings, options);
            break;
        case HomeSectionType.ResumeBook:
            loadResume(elem, apiClient, 'HeaderContinueReading', 'Book', userSettings, options);
            break;
        case HomeSectionType.SmallLibraryTiles:
            loadLibraryTiles(elem, userViews, options);
            break;
        default:
            elem.innerHTML = '';
    }

    return Promise.resolve();
}

function enableScrollX() {
    return true;
}

export default {
    getDefaultSection,
    loadSections,
    destroySections,
    pause,
    resume
};
