import type { UserDto } from '@jellyfin/sdk/lib/generated-client';
import type { ApiClient } from 'jellyfin-apiclient';

import { ServerConnections } from 'lib/jellyfin-apiclient';

import { getMinitigerAccessToken } from './apiAuth';
import type { MinitigerProfile } from './config/profiles';

interface MinitigerProfileRuntime {
    version: 1;
    serverId: string;
    ownerUserId: string;
    ownerUserName: string;
    ownerAccessToken: string;
    ownerUser: UserDto;
    activeProfileId: string;
    activeJellyfinUserId: string;
}

interface MinitigerProfileAuthenticationResult {
    AccessToken: string;
    ServerId: string;
    User: UserDto;
    SessionInfo?: unknown;
}

interface MinitigerCredentialServer {
    Id?: string;
    UserId?: string | null;
    AccessToken?: string | null;
    [key: string]: unknown;
}

interface MinitigerCredentialsState {
    Servers?: MinitigerCredentialServer[];
    [key: string]: unknown;
}

interface MinitigerCredentialProvider {
    credentials: (
        data?: MinitigerCredentialsState
    ) => MinitigerCredentialsState;
}

interface MinitigerConnectionManagerCompat {
    credentialProvider?: () => MinitigerCredentialProvider;
}

interface MinitigerAuthenticatedApiClient extends ApiClient {
    onAuthenticated?: (
        instance: ApiClient,
        result: MinitigerProfileAuthenticationResult
    ) => Promise<void> | void;
}

interface MinitigerProfileAuthenticatePayload {
    profileId: string;
    displayName: string;
    avatar: string;
    avatarImage: string;
    app: string;
    appVersion: string;
    deviceName: string;
    deviceId: string;
}

const RUNTIME_KEY_PREFIX =
    'minitiger.profile-runtime.v1:';

const getRuntimeKey = (serverId: string) =>
    `${RUNTIME_KEY_PREFIX}${serverId}`;

const safeServerId = (apiClient?: ApiClient) => {
    try {
        return apiClient?.serverId?.() ?? '';
    } catch {
        return '';
    }
};

const readRuntime = (
    serverId: string
): MinitigerProfileRuntime | null => {
    if (!serverId || typeof window === 'undefined') {
        return null;
    }

    try {
        const raw = window.sessionStorage.getItem(
            getRuntimeKey(serverId)
        );

        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as
            Partial<MinitigerProfileRuntime>;

        if (
            parsed.version !== 1
            || typeof parsed.ownerUserId !== 'string'
            || typeof parsed.ownerAccessToken !== 'string'
            || !parsed.ownerUser
        ) {
            return null;
        }

        return parsed as MinitigerProfileRuntime;
    } catch {
        return null;
    }
};

const writeRuntime = (
    runtime: MinitigerProfileRuntime
) => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.sessionStorage.setItem(
            getRuntimeKey(runtime.serverId),
            JSON.stringify(runtime)
        );
    } catch (error) {
        console.warn(
            '[Minitiger Profiles] Runtime konnte nicht gespeichert werden.',
            error
        );
    }
};

const normalizeAuthResult = (
    value: unknown,
    fallbackServerId: string
): MinitigerProfileAuthenticationResult => {
    const source = value as Record<string, unknown>;
    const user = (
        source.User
        ?? source.user
    ) as UserDto | undefined;
    const accessToken = String(
        source.AccessToken
        ?? source.accessToken
        ?? ''
    );
    const serverId = String(
        source.ServerId
        ?? source.serverId
        ?? fallbackServerId
    );

    if (!user?.Id || !accessToken || !serverId) {
        throw new Error(
            'Das Minitiger-Profil lieferte keine gültige Jellyfin-Sitzung.'
        );
    }

    return {
        AccessToken: accessToken,
        ServerId: serverId,
        User: {
            ...user,
            ServerId: user.ServerId || serverId
        },
        SessionInfo:
            source.SessionInfo
            ?? source.sessionInfo
    };
};

const applyFullAuthenticationResult = async (
    apiClient: ApiClient,
    result: MinitigerProfileAuthenticationResult
) => {
    const compatibleClient =
        apiClient as MinitigerAuthenticatedApiClient;

    if (
        typeof compatibleClient.onAuthenticated
        !== 'function'
    ) {
        throw new Error(
            'Jellyfins vollständiger Login-Wechsel ist in diesem Client nicht verfügbar.'
        );
    }

    /*
     * Use Jellyfin's own complete authentication lifecycle.
     * ConnectionManager updates the legacy ApiClient and calls
     * updateApiClientSdk(), which also updates the SDK WebSocket URL.
     *
     * Do NOT manually open/reopen the legacy WebSocket here. The modern
     * Jellyfin SDK owns its reconnect lifecycle and a second manual socket
     * caused the red /socket race seen in 18.17.2b.
     */
    await compatibleClient.onAuthenticated(
        apiClient,
        result
    );
};

const restoreDurableOwnerCredential = (
    runtime: MinitigerProfileRuntime
) => {
    const manager = (
        ServerConnections as unknown
    ) as MinitigerConnectionManagerCompat;

    const provider =
        manager.credentialProvider?.();

    if (!provider) {
        throw new Error(
            'Jellyfins gespeicherter Login konnte nicht erreicht werden.'
        );
    }

    const credentials =
        provider.credentials();

    const servers =
        Array.isArray(credentials.Servers)
            ? credentials.Servers
            : [];

    let matched = false;

    /*
     * IMPORTANT:
     * Never mutate the server object currently owned by ApiClient.
     * Jellyfin's full authentication flow intentionally keeps that
     * in-memory object on the selected subprofile.
     *
     * Only replace the credential-provider copy with a cloned owner
     * record. This means:
     *
     *   live ApiClient / SDK / WebSocket -> selected profile
     *   durable auto-login credential    -> household owner
     */
    const nextServers = servers.map(server => {
        if (
            String(server.Id ?? '')
                .toLowerCase()
            !== runtime.serverId.toLowerCase()
        ) {
            return server;
        }

        matched = true;

        return {
            ...server,
            UserId: runtime.ownerUserId,
            AccessToken: runtime.ownerAccessToken
        };
    });

    if (!matched) {
        throw new Error(
            'Der gespeicherte Jellyfin-Server des Hauptprofils wurde nicht gefunden.'
        );
    }

    provider.credentials({
        ...credentials,
        Servers: nextServers
    });
};

const ownerUnloadGuards =
    new Set<string>();

const ensureOwnerCredentialUnloadGuard = (
    serverId: string
) => {
    if (
        typeof window === 'undefined'
        || !serverId
        || ownerUnloadGuards.has(serverId)
    ) {
        return;
    }

    const restoreOwnerForUnload = () => {
        const runtime = readRuntime(serverId);

        if (
            !runtime
            || runtime.activeProfileId === 'owner'
        ) {
            return;
        }

        try {
            /*
             * Only at a REAL document unload do we restore the durable
             * Jellyfin login to the household owner.
             *
             * Normal React/Jellyfin navigation never fires pagehide or
             * beforeunload, therefore the saved credential remains aligned
             * with the live subprofile for the whole SPA session.
             */
            restoreDurableOwnerCredential(runtime);
        } catch (error) {
            console.warn(
                '[Minitiger Profiles] Hauptlogin konnte beim Seiten-Unload nicht zurückgeschrieben werden.',
                error
            );
        }
    };

    window.addEventListener(
        'pagehide',
        restoreOwnerForUnload
    );
    window.addEventListener(
        'beforeunload',
        restoreOwnerForUnload
    );

    ownerUnloadGuards.add(serverId);
};

const applySubprofileAuthentication = async (
    apiClient: ApiClient,
    result: MinitigerProfileAuthenticationResult,
    runtime: MinitigerProfileRuntime
) => {
    ensureOwnerCredentialUnloadGuard(
        runtime.serverId
    );

    /*
     * IMPORTANT:
     * Do NOT restore the persisted Jellyfin credential to the owner here.
     *
     * While Minitiger is running, live ApiClient + SDK + WebSockets +
     * jellyfin_credentials must all describe the SAME selected profile.
     * Otherwise normal Home/navigation code can resurrect the owner.
     *
     * The owner credential is restored synchronously only when the actual
     * document unloads (pagehide/beforeunload).
     */
    await applyFullAuthenticationResult(
        apiClient,
        result
    );
};


const authenticatedUrl = (
    apiClient: ApiClient,
    path: string
) => {
    const token = getMinitigerAccessToken(apiClient);

    return apiClient.getUrl(
        path,
        token ? { ApiKey: token } : {}
    );
};

export const captureMinitigerOwnerSession = (
    apiClient: ApiClient | undefined,
    user: UserDto | undefined
) => {
    if (!apiClient || !user?.Id) {
        return null;
    }

    const serverId = safeServerId(apiClient);

    if (!serverId) {
        return null;
    }

    const existing = readRuntime(serverId);
    const currentAccessToken =
        getMinitigerAccessToken(apiClient);

    if (existing && user.Id === existing.activeJellyfinUserId
        && user.Id !== existing.ownerUserId) {
        return existing;
    }

    if (!currentAccessToken) {
        return null;
    }

    if (
        existing
        && user.Id !== existing.ownerUserId
        && user.Id !== existing.activeJellyfinUserId
    ) {
        /*
         * A real Minitiger subprofile switch is PRE-ARMED before Jellyfin's
         * authentication lifecycle changes useApi().user, so that identity
         * is already present as activeJellyfinUserId here.
         *
         * An unknown Jellyfin user therefore means a genuine account change
         * (for example: manual logout -> login as another server account).
         * The old household runtime must not leak into that new account.
         */
        try {
            window.sessionStorage.removeItem(
                getRuntimeKey(serverId)
            );
        } catch {
            // The fresh owner runtime below still replaces the in-memory view.
        }
    }

    if (existing && user.Id === existing.ownerUserId) {
        /*
         * Seeing the durable owner login again can happen when Jellyfin
         * re-enters/reloads the Home route. That is NOT an explicit
         * profile choice. Refresh only the saved owner credentials and
         * keep the selected Minitiger profile intact.
         *
         * The runtime is intentionally switched to owner only inside
         * switchMinitigerProfileIdentity() when the owner tile is chosen.
         */
        const refreshed: MinitigerProfileRuntime = {
            ...existing,
            ownerUserName:
                user.Name?.trim()
                || existing.ownerUserName,
            ownerAccessToken: currentAccessToken,
            ownerUser: {
                ...user,
                ServerId: user.ServerId || serverId
            }
        };

        writeRuntime(refreshed);
        ensureOwnerCredentialUnloadGuard(
            serverId
        );
        return refreshed;
    }

    const runtime: MinitigerProfileRuntime = {
        version: 1,
        serverId,
        ownerUserId: user.Id,
        ownerUserName:
            user.Name?.trim()
            || 'Hauptprofil',
        ownerAccessToken: currentAccessToken,
        ownerUser: {
            ...user,
            ServerId: user.ServerId || serverId
        },
        activeProfileId: 'owner',
        activeJellyfinUserId: user.Id
    };

    writeRuntime(runtime);
    ensureOwnerCredentialUnloadGuard(
        serverId
    );
    return runtime;
};

export const getMinitigerHouseholdContext = (
    apiClient: ApiClient | undefined,
    user: UserDto | undefined
) => {
    const serverId = safeServerId(apiClient);
    const runtime = serverId
        ? readRuntime(serverId)
        : null;

    if (
        runtime
        && user?.Id
        && (
            user.Id === runtime.ownerUserId
            || user.Id === runtime.activeJellyfinUserId
        )
    ) {
        return {
            ownerUserId: runtime.ownerUserId,
            ownerUserName: runtime.ownerUserName,
            isOwnerIdentity:
                user.Id === runtime.ownerUserId
        };
    }

    return {
        ownerUserId: user?.Id ?? '',
        ownerUserName:
            user?.Name?.trim()
            || 'Hauptprofil',
        isOwnerIdentity: Boolean(user?.Id)
    };
};

export const isMinitigerProfileIdentityCurrent = (
    apiClient: ApiClient | undefined,
    user: UserDto | undefined,
    profile: MinitigerProfile | null
) => {
    if (!apiClient || !user?.Id || !profile) {
        return false;
    }

    const serverId = safeServerId(apiClient);
    const runtime = serverId
        ? readRuntime(serverId)
        : null;

    if (profile.isOwner) {
        return runtime
            ? user.Id === runtime.ownerUserId
            : true;
    }

    return Boolean(
        runtime
        && runtime.activeProfileId === profile.id
        && runtime.activeJellyfinUserId === user.Id
    );
};

export const syncMinitigerServerProfiles = async (
    apiClient: ApiClient,
    profiles: MinitigerProfile[]
) => {
    const subprofiles = profiles
        .filter(profile => !profile.isOwner)
        .map(profile => ({
            profileId: profile.id,
            displayName: profile.name,
            avatar: profile.avatar,
            avatarImage: profile.avatarImage ?? ''
        }));

    if (subprofiles.length === 0) {
        return;
    }

    const response = await fetch(
        authenticatedUrl(
            apiClient,
            'Minitiger/Profiles/Sync'
        ),
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                profiles: subprofiles
            })
        }
    );

    if (response.status === 404) {
        throw new Error(
            'Das Minitiger Companion Plugin ist noch nicht auf Phase 18.17.1 aktualisiert.'
        );
    }

    if (!response.ok) {
        const details = await response.text()
            .catch(() => '');

        throw new Error(
            `Profil-Synchronisierung fehlgeschlagen (HTTP ${response.status})${details ? ` · ${details}` : ''}`
        );
    }
};

const authenticateSubprofile = async (
    apiClient: ApiClient,
    profile: MinitigerProfile
) => {
    const payload: MinitigerProfileAuthenticatePayload = {
        profileId: profile.id,
        displayName: profile.name,
        avatar: profile.avatar,
        avatarImage: profile.avatarImage ?? '',
        app: apiClient.appName?.() || 'Minitiger',
        appVersion:
            apiClient.appVersion?.()
            || '18.17.2',
        deviceName:
            apiClient.deviceName?.()
            || 'Minitiger',
        deviceId:
            apiClient.deviceId?.()
            || 'minitiger-device'
    };

    const response = await fetch(
        authenticatedUrl(
            apiClient,
            'Minitiger/Profiles/Authenticate'
        ),
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        }
    );

    if (response.status === 404) {
        throw new Error(
            'Das Minitiger Companion Plugin ist noch nicht auf Phase 18.17.1 aktualisiert.'
        );
    }

    if (!response.ok) {
        const details = await response.text()
            .catch(() => '');

        throw new Error(
            `Profilwechsel fehlgeschlagen (HTTP ${response.status})${details ? ` · ${details}` : ''}`
        );
    }

    return normalizeAuthResult(
        await response.json() as unknown,
        safeServerId(apiClient)
    );
};

export const switchMinitigerProfileIdentity = async (
    apiClient: ApiClient,
    user: UserDto,
    profile: MinitigerProfile
) => {
    let runtime = captureMinitigerOwnerSession(
        apiClient,
        user
    );

    if (!runtime) {
        throw new Error(
            'Der Hauptlogin konnte für den Profilwechsel nicht gesichert werden.'
        );
    }

    if (profile.isOwner) {
        const previousRuntime = runtime;

        runtime = {
            ...runtime,
            activeProfileId: 'owner',
            activeJellyfinUserId: runtime.ownerUserId
        };
        writeRuntime(runtime);

        const ownerResult: MinitigerProfileAuthenticationResult = {
            AccessToken: runtime.ownerAccessToken,
            ServerId: runtime.serverId,
            User: {
                ...runtime.ownerUser,
                ServerId:
                    runtime.ownerUser.ServerId
                    || runtime.serverId
            }
        };

        try {
            if (user.Id !== runtime.ownerUserId) {
                await applyFullAuthenticationResult(
                    apiClient,
                    ownerResult
                );
            }
        } catch (error) {
            writeRuntime(previousRuntime);
            throw error;
        }

        return runtime.ownerUserId;
    }

    /*
     * Re-opening the profile picker while the same subprofile is already
     * the complete active Jellyfin identity does not need another token.
     */
    if (
        runtime.activeProfileId === profile.id
        && runtime.activeJellyfinUserId === user.Id
        && user.Id !== runtime.ownerUserId
    ) {
        ensureOwnerCredentialUnloadGuard(
            runtime.serverId
        );
        return user.Id;
    }

    const result = await authenticateSubprofile(
        apiClient,
        profile
    );

    const previousRuntime = runtime;

    /*
     * PRE-ARM the runtime before Jellyfin emits localusersignedin.
     * React/useApi can update immediately during the full auth lifecycle;
     * every Minitiger consumer must already know that this Jellyfin user is
     * the selected subprofile and NOT a new household owner.
     */
    runtime = {
        ...runtime,
        activeProfileId: profile.id,
        activeJellyfinUserId: result.User.Id ?? ''
    };
    writeRuntime(runtime);

    try {
        await applySubprofileAuthentication(
            apiClient,
            result,
            runtime
        );
    } catch (error) {
        writeRuntime(previousRuntime);
        throw error;
    }

    return result.User.Id ?? '';
};

// MINITIGER_PATCH_MARKER: PHASE_18_17_2_FULL_JELLYFIN_SESSION_SWITCH

export const deleteMinitigerServerProfile = async (
    apiClient: ApiClient,
    profileId: string
) => {
    const response = await fetch(
        authenticatedUrl(
            apiClient,
            `Minitiger/Profiles/${encodeURIComponent(profileId)}`
        ),
        { method: 'DELETE' }
    );

    if (
        response.status === 404
        || response.status === 204
    ) {
        return;
    }

    if (!response.ok) {
        const details = await response.text()
            .catch(() => '');

        throw new Error(
            `Technisches Unterprofil konnte nicht entfernt werden (HTTP ${response.status})${details ? ` · ${details}` : ''}`
        );
    }
};

// MINITIGER_PATCH_MARKER: PHASE_18_17_1_PROFILE_IDENTITY
// MINITIGER_PATCH_MARKER: PHASE_18_17_1A_SESSION_PERSISTENCE

// MINITIGER_PATCH_MARKER: PHASE_18_17_2A_RUNTIME_PREARM

// MINITIGER_PATCH_MARKER: PHASE_18_17_2B_LIVE_CREDENTIAL_ALIGNMENT
// MINITIGER_PATCH_MARKER: PHASE_18_17_2B_WEBSOCKET_HANDOFF

// MINITIGER_PATCH_MARKER: PHASE_18_17_2C_JELLYFIN_OWNS_WEBSOCKET

// MINITIGER_PATCH_MARKER: PHASE_18_17_4_PROFILE_AVATAR_PAYLOAD
