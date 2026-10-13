import createDOMPurify from 'dompurify';
import markdownIt from 'markdown-it';

import { AppFeature } from 'constants/appFeature';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import { appHost } from 'components/apphost';
import appSettings from 'scripts/settings/appSettings';
import dom from 'utils/dom';
import loading from 'components/loading/loading';
import layoutManager from 'components/layoutManager';
import libraryMenu from 'scripts/libraryMenu';
import browser from 'scripts/browser';
import globalize from 'lib/globalize';
import 'components/cardbuilder/card.scss';
import 'elements/emby-checkbox/emby-checkbox';
import Dashboard from 'utils/dashboard';
import toast from 'components/toast/toast';
import dialogHelper from 'components/dialogHelper/dialogHelper';
import baseAlert from 'components/alert';
import { getDefaultBackgroundClass } from 'components/cardbuilder/utils/builder';

import './login.scss';

const domPurify = createDOMPurify();
domPurify.setConfig({
    // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/regex-complexity -- DOMPurify config option; customizes its default regex
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|callto|cid|xmpp|matrix|tg|whatsapp|signal|ircs?):|[^a-z]|[a-z+.-]+(?:[^-a-z+.:]|$))/i
});

const enableFocusTransform = !browser.slow && !browser.edge;
// MINITIGER_PATCH_MARKER: PHASE_18_9_0_TEST_CUSTOM_LOGIN
// MINITIGER_PATCH_MARKER: PHASE_18_11_0_TEST_CUSTOM_USER_AVATARS
const MINITIGER_LOGIN_CONFIG_PATTERN = /<!--\s*MINITIGER_LOGIN_CONFIG:([A-Za-z0-9+/=]+)\s*-->/;
const MINITIGER_LOGIN_USERS_VERSION = 1;

const DEFAULT_MINITIGER_LOGIN_CONFIG = {
    enabled: false,
    layout: 'classic',
    backgroundImage: '',
    backgroundDim: 48,
    backgroundBlur: 3,
    logoImage: '',
    logoSize: 260,
    accentColor: '#ffbf00'
};

const clampMinitigerLoginNumber = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(parsed)));
};

const normalizeMinitigerLoginConfig = value => {
    if (!value || typeof value !== 'object') {
        return { ...DEFAULT_MINITIGER_LOGIN_CONFIG };
    }

    const layout = value.layout === 'cinematic' || value.layout === 'minimal'
        ? value.layout
        : 'classic';

    return {
        enabled: value.enabled === true,
        layout,
        backgroundImage: typeof value.backgroundImage === 'string'
            ? value.backgroundImage
            : '',
        backgroundDim: clampMinitigerLoginNumber(
            value.backgroundDim,
            DEFAULT_MINITIGER_LOGIN_CONFIG.backgroundDim,
            0,
            90
        ),
        backgroundBlur: clampMinitigerLoginNumber(
            value.backgroundBlur,
            DEFAULT_MINITIGER_LOGIN_CONFIG.backgroundBlur,
            0,
            20
        ),
        logoImage: typeof value.logoImage === 'string'
            ? value.logoImage
            : '',
        logoSize: clampMinitigerLoginNumber(
            value.logoSize,
            DEFAULT_MINITIGER_LOGIN_CONFIG.logoSize,
            100,
            520
        ),
        accentColor: typeof value.accentColor === 'string'
            && /^#[0-9a-f]{6}$/i.test(value.accentColor)
            ? value.accentColor
            : DEFAULT_MINITIGER_LOGIN_CONFIG.accentColor
    };
};

const getMinitigerLoginConfig = disclaimer => {
    const match = MINITIGER_LOGIN_CONFIG_PATTERN.exec(disclaimer || '');
    if (!match) {
        return { ...DEFAULT_MINITIGER_LOGIN_CONFIG };
    }

    try {
        const binary = atob(match[1]);
        const bytes = Uint8Array.from(
            binary,
            character => character.charCodeAt(0)
        );
        return normalizeMinitigerLoginConfig(
            JSON.parse(new TextDecoder().decode(bytes))
        );
    } catch (error) {
        console.warn('[Minitiger Login] Konfiguration konnte nicht gelesen werden.', error);
        return { ...DEFAULT_MINITIGER_LOGIN_CONFIG };
    }
};

const applyMinitigerLoginBranding = (view, options) => {
    const config = getMinitigerLoginConfig(options?.LoginDisclaimer || '');
    const layouts = [ 'classic', 'cinematic', 'minimal' ];

    view.classList.toggle('minitigerLoginEnabled', config.enabled);
    for (const layout of layouts) {
        view.classList.toggle(
            `minitigerLoginLayout-${layout}`,
            config.enabled && config.layout === layout
        );
    }

    view.style.setProperty(
        '--mt-login-dim',
        String(config.backgroundDim / 100)
    );
    view.style.setProperty(
        '--mt-login-blur',
        `${config.backgroundBlur}px`
    );
    view.style.setProperty(
        '--mt-login-logo-size',
        `${config.logoSize}px`
    );
    view.style.setProperty(
        '--mt-login-accent',
        config.accentColor
    );

    const backdrop = view.querySelector('.minitigerLoginBackdrop');
    if (backdrop) {
        backdrop.style.backgroundImage =
            config.enabled && config.backgroundImage
                ? `url(${JSON.stringify(config.backgroundImage)})`
                : '';
    }

    const logo = view.querySelector('.minitigerLoginLogo');
    if (logo) {
        if (config.enabled && config.logoImage) {
            logo.src = config.logoImage;
            logo.classList.remove('hide');
        } else {
            logo.removeAttribute('src');
            logo.classList.add('hide');
        }
    }
};

const getMinitigerLoginUsersKey = apiClient => {
    let serverId = 'server';
    let deviceId = 'device';

    try {
        serverId = apiClient.serverId?.() || serverId;
    } catch (error) {
        console.debug('[Minitiger Login] serverId nicht verfügbar', error);
    }

    try {
        deviceId = apiClient.deviceId?.() || deviceId;
    } catch (error) {
        console.debug('[Minitiger Login] deviceId nicht verfügbar', error);
    }

    return `minitiger.login.users.v${MINITIGER_LOGIN_USERS_VERSION}:${serverId}:${deviceId}`;
};

const getRememberedMinitigerLoginUsers = apiClient => {
    try {
        const parsed = JSON.parse(
            localStorage.getItem(getMinitigerLoginUsersKey(apiClient)) || '[]'
        );

        if (!Array.isArray(parsed)) {
            return [];
        }

        // Recover direct custom avatars from the user's persistent
        // settings if a remembered-login entry was written before avatar
        // synchronization had completed.
        const serverId = apiClient?.serverId?.() || 'server';
        return parsed.filter(user =>
            user
            && typeof user.Id === 'string'
            && typeof user.Name === 'string'
        ).slice(0, 12).map(user => {
            if (user.MinitigerAvatar) return user;
            try {
                const raw = localStorage.getItem(
                    `Minitiger.CustomAvatar.v1:${serverId}:${user.Id}`
                );
                const saved = raw ? JSON.parse(raw) : null;
                const image = saved?.image;
                if (typeof image === 'string' && image.startsWith('data:image/')) {
                    return { ...user, MinitigerAvatar: image };
                }
            } catch {
                // Continue with the public Jellyfin avatar fallback.
            }
            return user;
        });
    } catch (error) {
        console.warn('[Minitiger Login] Lokale Benutzerliste konnte nicht gelesen werden.', error);
        return [];
    }
};

const rememberMinitigerLoginUser = (apiClient, user) => {
    if (!user?.Id || !user?.Name) {
        return;
    }

    try {
        const remembered =
            getRememberedMinitigerLoginUsers(apiClient);
        const previous = remembered.find(
            entry => entry.Id === user.Id
        );
        const existing = remembered.filter(
            entry => entry.Id !== user.Id
        );
        const next = [
            {
                Id: user.Id,
                Name: user.Name,
                HasPassword: user.HasPassword !== false,
                PrimaryImageTag: user.PrimaryImageTag || null,
                MinitigerAvatar:
                    user.MinitigerAvatar || previous?.MinitigerAvatar || null
            },
            ...existing
        ].slice(0, 12);

        localStorage.setItem(
            getMinitigerLoginUsersKey(apiClient),
            JSON.stringify(next)
        );
    } catch (error) {
        console.warn('[Minitiger Login] Benutzer konnte nicht lokal gemerkt werden.', error);
    }
};

const forgetMinitigerLoginUser = (apiClient, userId) => {
    try {
        const next = getRememberedMinitigerLoginUsers(apiClient)
            .filter(user => user.Id !== userId);
        localStorage.setItem(
            getMinitigerLoginUsersKey(apiClient),
            JSON.stringify(next)
        );
    } catch (error) {
        console.warn('[Minitiger Login] Benutzer konnte nicht entfernt werden.', error);
    }
};

function authenticateUserByName(page, apiClient, url, username, password) {
    loading.show();
    apiClient.authenticateUserByName(username, password).then(function (result) {
        const user = result.User;
        loading.hide();

        onLoginSuccessful(user, result.AccessToken, apiClient, url);
    }, function (response) {
        page.querySelector('#txtManualPassword').value = '';
        loading.hide();

        const UnauthorizedOrForbidden = [401, 403];
        if (UnauthorizedOrForbidden.includes(response.status)) {
            const messageKey = response.status === 401 ? 'MessageInvalidUser' : 'MessageUnauthorizedUser';
            toast(globalize.translate(messageKey));
        } else {
            Dashboard.alert({
                message: globalize.translate('MessageUnableToConnectToServer'),
                title: globalize.translate('HeaderConnectionFailure')
            });
        }
    });
}

function authenticateQuickConnect(apiClient, targetUrl) {
    const url = apiClient.getUrl('/QuickConnect/Initiate');
    apiClient.ajax({ type: 'POST', url }, true).then(res => res.json()).then(function (json) {
        if (!json.Secret || !json.Code) {
            console.error('Malformed quick connect response', json);
            return false;
        }

        baseAlert({
            dialogOptions: {
                id: 'quickConnectAlert'
            },
            title: globalize.translate('QuickConnect'),
            text: globalize.translate('QuickConnectAuthorizeCode', json.Code)
        });

        const connectUrl = apiClient.getUrl('/QuickConnect/Connect?Secret=' + json.Secret);

        const interval = setInterval(function() {
            apiClient.getJSON(connectUrl).then(async function(data) {
                if (!data.Authenticated) {
                    return;
                }

                clearInterval(interval);

                // Close the QuickConnect dialog
                const dlg = document.getElementById('quickConnectAlert');
                if (dlg) {
                    dialogHelper.close(dlg);
                }

                const result = await apiClient.quickConnect(data.Secret);
                onLoginSuccessful(result.User, result.AccessToken, apiClient, targetUrl);
            }, function (e) {
                clearInterval(interval);

                // Close the QuickConnect dialog
                const dlg = document.getElementById('quickConnectAlert');
                if (dlg) {
                    dialogHelper.close(dlg);
                }

                Dashboard.alert({
                    message: globalize.translate('QuickConnectDeactivated'),
                    title: globalize.translate('HeaderError')
                });

                console.error('Unable to login with quick connect', e);
            });
        }, 5000, connectUrl);

        return true;
    }, function(e) {
        Dashboard.alert({
            message: globalize.translate('QuickConnectNotActive'),
            title: globalize.translate('HeaderError')
        });

        console.error('Quick connect error: ', e);
        return false;
    });
}

function onLoginSuccessful(user, accessToken, apiClient, url) {
    rememberMinitigerLoginUser(apiClient, user);
    Dashboard.onServerChanged(user.Id, accessToken, apiClient);
    Dashboard.navigate(url || 'home');
}

function showManualForm(context, showCancel, focusPassword) {
    context.querySelector('.chkRememberLogin').checked = appSettings.enableAutoLogin();
    context.querySelector('.manualLoginForm').classList.remove('hide');
    context.querySelector('.visualLoginForm').classList.add('hide');
    context.querySelector('.btnManual').classList.add('hide');

    if (focusPassword) {
        context.querySelector('#txtManualPassword').focus();
    } else {
        context.querySelector('#txtManualName').focus();
    }

    if (showCancel) {
        context.querySelector('.btnCancel').classList.remove('hide');
    } else {
        context.querySelector('.btnCancel').classList.add('hide');
    }
}

function loadUserList(context, apiClient, users) {
    let html = '';

    for (const user of users) {
        // TODO move card creation code to Card component
        let cssClass = 'card squareCard scalableCard squareCard-scalable';

        if (layoutManager.tv) {
            cssClass += ' show-focus';

            if (enableFocusTransform) {
                cssClass += ' show-animation';
            }
        }

        const cardBoxCssClass = 'cardBox cardBox-bottompadded';
        html += '<button type="button" class="' + cssClass + '">';
        html += '<div class="' + cardBoxCssClass + '">';
        html += '<div class="cardScalable">';
        html += '<div class="cardPadder cardPadder-square"></div>';
        html += `<div class="cardContent" data-haspw="${user.HasPassword}" data-username="${user.Name}" data-userid="${user.Id}">`;
        let imgUrl;

        if (
            typeof user.MinitigerAvatar === 'string'
            && user.MinitigerAvatar.startsWith('data:image/')
        ) {
            imgUrl = user.MinitigerAvatar;
            html += '<div class="cardImageContainer coveredImage minitigerCustomLoginAvatar" style="background-image:url(\'' + imgUrl + "');\"></div>";
        } else if (user.PrimaryImageTag) {
            imgUrl = apiClient.getUserImageUrl(user.Id, {
                width: 300,
                tag: user.PrimaryImageTag,
                type: 'Primary'
            });

            html += '<div class="cardImageContainer coveredImage" style="background-image:url(\'' + imgUrl + "');\"></div>";
        } else {
            html += `<div class="cardImage flex align-items-center justify-content-center ${getDefaultBackgroundClass()}">`;
            html += '<span class="material-icons cardImageIcon person" aria-hidden="true"></span>';
            html += '</div>';
        }

        html += '</div>';
        html += '</div>';
        html += '<div class="cardFooter visualCardBox-cardFooter">';
        html += '<div class="cardText singleCardText cardTextCentered">' + user.Name + '</div>';
        html += '<span class="minitigerRememberedForget" data-userid="' + user.Id + '" role="button" tabindex="0">Von diesem Gerät vergessen</span>';
        html += '</div>';
        html += '</div>';
        html += '</button>';
    }

    context.querySelector('#divUsers').innerHTML = html;
}

export default function (view, params) {
    function getApiClient() {
        const serverId = params.serverid;

        if (serverId) {
            return ServerConnections.getOrCreateApiClient(serverId);
        }

        return ApiClient;
    }

    function getTargetUrl() {
        if (params.url) {
            try {
                return decodeURIComponent(params.url);
            } catch (err) {
                console.warn('[LoginPage] unable to decode url param', params.url, err);
            }
        }

        return '/home';
    }

    function showVisualForm() {
        view.querySelector('.visualLoginForm').classList.remove('hide');
        view.querySelector('.manualLoginForm').classList.add('hide');
        view.querySelector('.btnManual').classList.remove('hide');

        import('components/autoFocuser').then(({ default: autoFocuser }) => {
            autoFocuser.autoFocus(view);
        });
    }

    function showRememberedUsers() {
        const apiClient = getApiClient();
        const users = getRememberedMinitigerLoginUsers(apiClient);

        if (users.length) {
            showVisualForm();
            loadUserList(view, apiClient, users);
            return;
        }

        view.querySelector('#divUsers').innerHTML = '';
        view.querySelector('#txtManualName').value = '';
        showManualForm(view, false, false);
    }

    function showOriginalPublicUsers() {
        const apiClient = getApiClient();
        return apiClient.getPublicUsers().then(function (users) {
            if (users.length) {
                showVisualForm();
                loadUserList(view, apiClient, users);
            } else {
                view.querySelector('#txtManualName').value = '';
                showManualForm(view, false, false);
            }
        }).catch(function (error) {
            console.debug('[Minitiger Login] Originale Public-User-Liste konnte nicht geladen werden.', error);
            view.querySelector('#txtManualName').value = '';
            showManualForm(view, false, false);
        });
    }

    view.querySelector('#divUsers').addEventListener('click', function (e) {
        const target = e.target instanceof Element ? e.target : null;
        const forgetButton = target?.closest('.minitigerRememberedForget');

        if (forgetButton) {
            e.preventDefault();
            e.stopPropagation();
            forgetMinitigerLoginUser(
                getApiClient(),
                forgetButton.getAttribute('data-userid')
            );
            showRememberedUsers();
            return;
        }

        const card = dom.parentWithClass(e.target, 'card');
        const cardContent = card ? card.querySelector('.cardContent') : null;

        if (cardContent) {
            const context = view;
            const id = cardContent.getAttribute('data-userid');
            const name = cardContent.getAttribute('data-username');
            const haspw = cardContent.getAttribute('data-haspw');

            if (id === 'manual') {
                context.querySelector('#txtManualName').value = '';
                showManualForm(context, true);
            } else if (haspw == 'false') {
                authenticateUserByName(context, getApiClient(), getTargetUrl(), name, '');
            } else {
                context.querySelector('#txtManualName').value = name;
                context.querySelector('#txtManualPassword').value = '';
                showManualForm(context, true, true);
            }
        }
    });
    view.querySelector('.manualLoginForm').addEventListener('submit', function (e) {
        appSettings.enableAutoLogin(view.querySelector('.chkRememberLogin').checked);
        authenticateUserByName(view, getApiClient(), getTargetUrl(), view.querySelector('#txtManualName').value, view.querySelector('#txtManualPassword').value);
        e.preventDefault();
        return false;
    });
    view.querySelector('.btnForgotPassword').addEventListener('click', function () {
        Dashboard.navigate('forgotpassword');
    });
    view.querySelector('.btnCancel').addEventListener('click', showVisualForm);
    view.querySelector('.btnQuick').addEventListener('click', function () {
        authenticateQuickConnect(getApiClient(), getTargetUrl());
        return false;
    });
    view.querySelector('.btnManual').addEventListener('click', function () {
        view.querySelector('#txtManualName').value = '';
        showManualForm(view, true);
    });
    view.querySelector('.btnSelectServer').addEventListener('click', function () {
        Dashboard.selectServer();
    });

    view.addEventListener('viewshow', function () {
        loading.show();
        libraryMenu.setTransparentMenu(true);

        if (!appHost.supports(AppFeature.MultiServer)) {
            view.querySelector('.btnSelectServer').classList.add('hide');
        }

        const apiClient = getApiClient();

        apiClient.getQuickConnect('Enabled')
            .then(enabled => {
                if (enabled === true) {
                    view.querySelector('.btnQuick').classList.remove('hide');
                }
            })
            .catch(() => {
                console.debug('Failed to get QuickConnect status');
            });

        // Nutzerliste wird nach dem Laden der globalen Login-Konfiguration gewählt.
        apiClient.getJSON(apiClient.getUrl('Branding/Configuration')).then(function (options) {
            const loginConfig = getMinitigerLoginConfig(options.LoginDisclaimer || '');
            applyMinitigerLoginBranding(view, options);

            if (loginConfig.enabled) {
                showRememberedUsers();
                loading.hide();
            } else {
                showOriginalPublicUsers().finally(() => loading.hide());
            }

            const loginDisclaimer = view.querySelector('.loginDisclaimer');

            // eslint-disable-next-line sonarjs/disabled-auto-escaping
            loginDisclaimer.innerHTML = domPurify.sanitize(markdownIt({ html: true }).render(options.LoginDisclaimer || ''));

            for (const elem of loginDisclaimer.querySelectorAll('a')) {
                elem.rel = 'noopener noreferrer';
                elem.target = '_blank';
                elem.classList.add('button-link');
                elem.setAttribute('is', 'emby-linkbutton');

                if (layoutManager.tv) {
                    // Disable links navigation on TV
                    elem.tabIndex = -1;
                }
            }
        }).catch(function (error) {
            console.debug('[Minitiger Login] Branding-Konfiguration konnte nicht geladen werden.', error);
            applyMinitigerLoginBranding(view, {});
            showOriginalPublicUsers().finally(() => loading.hide());
        });
    });
    view.addEventListener('viewhide', function () {
        libraryMenu.setTransparentMenu(false);
    });
}

