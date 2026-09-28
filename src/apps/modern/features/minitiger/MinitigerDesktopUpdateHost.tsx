import React, {
    useEffect,
    useState
} from 'react';

import { useApi } from 'hooks/useApi';

import { getMinitigerAccessToken } from 'apps/modern/routes/minitiger/home/apiAuth';

interface MinitigerDesktopUpdateStatus {
    enabled: boolean;
    available: boolean;
    message: string;
    version: string;
    currentBuild: number;
    latestBuild: number;
    packageType: string;
    fileName: string;
    size: number;
    sha256: string;
    downloadPath: string;
    downloadExpiresAt?: string | null;
}

type MinitigerNativeUpdateSystem = {
    applyMinitigerUpdate?: (
        url: string,
        sha256: string,
        packageType: string,
        targetBuild: number,
        targetVersion: string
    ) => boolean | void;
};

type MinitigerUpdateWindow = Window & {
    __minitigerDesktopUpdateCheckKey?: string;
    jmpInfo?: {
        bundledMinitigerWeb?: boolean;
        updateBuild?: number | string;
        updateFailedBuild?: number | string;
        portable?: boolean;
        version?: string;
    };
    api?: {
        system?: MinitigerNativeUpdateSystem;
    };
    apiPromise?: Promise<{
        system?: MinitigerNativeUpdateSystem;
    }>;
    initCompleted?: Promise<void>;
};

const normalizeStatus = (
    value: unknown
): MinitigerDesktopUpdateStatus => {
    const source =
        value && typeof value === 'object'
            ? value as Record<string, unknown>
            : {};

    const pick = (
        camel: string,
        pascal: string
    ) => source[camel] ?? source[pascal];

    return {
        enabled: pick('enabled', 'Enabled') === true,
        available: pick('available', 'Available') === true,
        message: String(
            pick('message', 'Message')
            ?? ''
        ),
        version: String(
            pick('version', 'Version')
            ?? ''
        ),
        currentBuild: Number(
            pick('currentBuild', 'CurrentBuild')
            ?? 0
        ),
        latestBuild: Number(
            pick('latestBuild', 'LatestBuild')
            ?? 0
        ),
        packageType: String(
            pick('packageType', 'PackageType')
            ?? ''
        ),
        fileName: String(
            pick('fileName', 'FileName')
            ?? ''
        ),
        size: Number(
            pick('size', 'Size')
            ?? 0
        ),
        sha256: String(
            pick('sha256', 'Sha256')
            ?? ''
        ),
        downloadPath: String(
            pick('downloadPath', 'DownloadPath')
            ?? ''
        ),
        downloadExpiresAt:
            String(
                pick(
                    'downloadExpiresAt',
                    'DownloadExpiresAt'
                )
                ?? ''
            )
            || null
    };
};

const wait = (milliseconds: number) =>
    new Promise(resolve =>
        window.setTimeout(resolve, milliseconds)
    );

interface UpdateNoticeState {
    status: MinitigerDesktopUpdateStatus;
    secondsRemaining: number;
}

const MinitigerDesktopUpdateHost = () => {
    const {
        user,
        __legacyApiClient__: apiClient
    } = useApi();

    const [
        notice,
        setNotice
    ] = useState<UpdateNoticeState | null>(
        null
    );

    useEffect(() => {
        if (
            !apiClient
            || typeof window === 'undefined'
        ) {
            return;
        }

        const nativeWindow =
            window as MinitigerUpdateWindow;

        if (
            !nativeWindow.jmpInfo?.bundledMinitigerWeb
        ) {
            return;
        }

        const accessToken =
            getMinitigerAccessToken(
                apiClient
            );

        // The first login has no token yet. Let the user sign in first; the
        // user dependency below will run this effect once credentials exist.
        if (!accessToken) {
            return;
        }

        const currentBuild =
            Number(
                nativeWindow.jmpInfo
                    ?.updateBuild
                ?? 0
            );

        const packageType =
            nativeWindow.jmpInfo
                ?.portable
                ? 'portable'
                : 'installer';

        const checkKey = [
            'minitiger.desktop-update-check.v2',
            apiClient.serverId?.()
                ?? 'server',
            currentBuild
        ].join(':');

        // One silent check per running Desktop session. AppLayout can remount
        // while switching between Home and the admin dashboard; that must not
        // look like a fresh application start.
        try {
            if (
                nativeWindow
                    .__minitigerDesktopUpdateCheckKey
                === checkKey
                || window.sessionStorage
                    .getItem(checkKey)
                === 'done'
            ) {
                return;
            }

            nativeWindow
                .__minitigerDesktopUpdateCheckKey =
                checkKey;

            window.sessionStorage.setItem(
                checkKey,
                'done'
            );
        } catch {
            nativeWindow
                .__minitigerDesktopUpdateCheckKey =
                checkKey;
        }

        let cancelled = false;

        void (async () => {
            console.info(
                '[Minitiger Update] Hintergrundprüfung:',
                {
                    currentBuild,
                    packageType
                }
            );

            try {
                const statusUrl =
                    apiClient.getUrl(
                        'Minitiger/DesktopUpdate/Status',
                        {
                            currentBuild,
                            packageType,
                            ApiKey: accessToken
                        }
                    );

                let response =
                    await fetch(
                        statusUrl,
                        {
                            method: 'GET',
                            cache: 'no-store'
                        }
                    );

                if (!response.ok) {
                    await wait(2_000);

                    if (cancelled) {
                        return;
                    }

                    response =
                        await fetch(
                            statusUrl,
                            {
                                method: 'GET',
                                cache: 'no-store'
                            }
                        );
                }

                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}`
                    );
                }

                const status =
                    normalizeStatus(
                        await response.json()
                    );

                const failedBuild =
                    Number(
                        nativeWindow.jmpInfo
                            ?.updateFailedBuild
                        ?? 0
                    );

                if (
                    cancelled
                    || !status.enabled
                    || !status.available
                    || status.latestBuild
                        <= currentBuild
                ) {
                    console.info(
                        '[Minitiger Update]',
                        status.message
                        || 'Kein neues Update verfügbar.'
                    );
                    return;
                }

                if (
                    status.latestBuild
                        === failedBuild
                ) {
                    console.warn(
                        '[Minitiger Update] Build wurde zuvor als fehlgeschlagen markiert und wird in dieser Version nicht erneut automatisch versucht:',
                        failedBuild
                    );
                    return;
                }

                if (
                    !status.downloadPath
                    || !/^[a-f0-9]{64}$/i.test(
                        status.sha256
                    )
                ) {
                    throw new Error(
                        'Ungültige Update-Metadaten.'
                    );
                }

                let nativeApi =
                    nativeWindow.api;

                if (
                    nativeWindow.initCompleted
                ) {
                    await nativeWindow
                        .initCompleted;
                }

                if (
                    !nativeApi
                    && nativeWindow.apiPromise
                ) {
                    nativeApi =
                        await nativeWindow
                            .apiPromise;
                }

                const applyUpdate =
                    nativeApi
                        ?.system
                        ?.applyMinitigerUpdate;

                if (
                    typeof applyUpdate
                    !== 'function'
                ) {
                    throw new Error(
                        'Der native Client unterstützt den privaten Auto-Updater noch nicht.'
                    );
                }

                const downloadUrl =
                    apiClient.getUrl(
                        status.downloadPath
                    );

                console.info(
                    '[Minitiger Update] Neues Update gefunden:',
                    status.version,
                    status.latestBuild
                );

                for (
                    let seconds = 10;
                    seconds >= 1;
                    seconds -= 1
                ) {
                    if (cancelled) {
                        return;
                    }

                    setNotice({
                        status,
                        secondsRemaining:
                            seconds
                    });

                    await wait(1_000);
                }

                if (cancelled) {
                    return;
                }

                setNotice({
                    status,
                    secondsRemaining: 0
                });

                const accepted =
                    applyUpdate(
                        downloadUrl,
                        status.sha256,
                        status.packageType,
                        status.latestBuild,
                        status.version
                    );

                if (accepted === false) {
                    console.warn(
                        '[Minitiger Update] Native Update-Übergabe wurde abgelehnt.'
                    );
                    setNotice(null);
                }
            } catch (error) {
                // Startup must never be blocked just because the private
                // update channel is temporarily unavailable.
                console.warn(
                    '[Minitiger Update] Hintergrundprüfung fehlgeschlagen.',
                    error
                );
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        apiClient,
        user?.Id
    ]);

    if (!notice) {
        return null;
    }

    const countdownText =
        notice.secondsRemaining > 0
            ? `In ${notice.secondsRemaining} Sekunde${notice.secondsRemaining === 1 ? '' : 'n'} wird das Update durchgeführt.`
            : 'Update wird jetzt gestartet …';

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 100000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background:
                    'rgba(4, 5, 7, 0.92)',
                backdropFilter:
                    'blur(14px)'
            }}
        >
            <div
                style={{
                    width:
                        'min(38rem, calc(100vw - 3rem))',
                    padding:
                        '1.75rem 2rem',
                    borderRadius:
                        '1rem',
                    border:
                        '1px solid rgba(255, 181, 61, 0.35)',
                    background:
                        'rgba(20, 18, 16, 0.97)',
                    textAlign:
                        'center',
                    boxShadow:
                        '0 1.25rem 4rem rgba(0, 0, 0, 0.45)'
                }}
            >
                <h2
                    style={{
                        margin: 0
                    }}
                >
                    Neues Minitiger-Update verfügbar 🐯
                </h2>

                <p>
                    {'Minitiger Desktop '}
                    {notice.status.version}
                    {' · Build '}
                    {notice.status.latestBuild}
                    {' ist verfügbar.'}
                </p>

                <p
                    style={{
                        fontWeight: 700,
                        fontSize: '1.08rem'
                    }}
                >
                    {countdownText}
                </p>

                <p>
                    Minitiger schließt sich dafür automatisch,
                    installiert die neue Version und startet danach
                    selbstständig wieder.
                </p>

                <small>
                    Der Neustart kann kurz dauern. Bitte den Client
                    währenddessen nicht manuell erneut starten.
                </small>
            </div>
        </div>
    );
};

export default MinitigerDesktopUpdateHost;
