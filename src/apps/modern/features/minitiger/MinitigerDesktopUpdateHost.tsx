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

const MinitigerDesktopUpdateHost = () => {
    const {
        user,
        __legacyApiClient__: apiClient
    } = useApi();

    const [
        applying,
        setApplying
    ] = useState<MinitigerDesktopUpdateStatus | null>(
        null
    );

    useEffect(() => {
        if (
            !apiClient
            || !user?.Id
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

        let cancelled = false;

        const timer =
            window.setTimeout(
                () => {
                    void (async () => {
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

                        const guardKey = [
                            'minitiger.desktop-update-check.v1',
                            apiClient.serverId?.()
                                ?? 'server',
                            currentBuild
                        ].join(':');

                        try {
                            if (
                                window.sessionStorage
                                    .getItem(
                                        guardKey
                                    )
                                === 'done'
                            ) {
                                return;
                            }

                            window.sessionStorage
                                .setItem(
                                    guardKey,
                                    'done'
                                );
                        } catch {
                            // A failed sessionStorage write must never block updates.
                        }

                        const accessToken =
                            getMinitigerAccessToken(
                                apiClient
                            );

                        if (!accessToken) {
                            console.info(
                                '[Minitiger Update] Kein Jellyfin-Token für den privaten Update-Check verfügbar.'
                            );
                            return;
                        }

                        const statusUrl =
                            apiClient.getUrl(
                                'Minitiger/DesktopUpdate/Status',
                                {
                                    currentBuild,
                                    packageType,
                                    ApiKey: accessToken
                                }
                            );

                        const response =
                            await fetch(
                                statusUrl,
                                {
                                    method: 'GET',
                                    cache: 'no-store'
                                }
                            );

                        if (!response.ok) {
                            console.warn(
                                '[Minitiger Update] Status-Check fehlgeschlagen:',
                                response.status
                            );
                            return;
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
                            || status.latestBuild
                                === failedBuild
                            || !status.downloadPath
                            || !/^[a-f0-9]{64}$/i.test(
                                status.sha256
                            )
                        ) {
                            if (
                                status.latestBuild
                                === failedBuild
                                && failedBuild > 0
                            ) {
                                console.warn(
                                    '[Minitiger Update] Dieser Build ist zuvor fehlgeschlagen und wird nicht automatisch erneut versucht:',
                                    failedBuild
                                );
                            } else if (
                                status.message
                                && status.enabled
                            ) {
                                console.info(
                                    '[Minitiger Update]',
                                    status.message
                                );
                            }

                            return;
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
                            console.warn(
                                '[Minitiger Update] Der native Client unterstützt den privaten Auto-Updater noch nicht.'
                            );
                            return;
                        }

                        const downloadUrl =
                            apiClient.getUrl(
                                status.downloadPath
                            );

                        if (cancelled) {
                            return;
                        }

                        setApplying(
                            status
                        );

                        console.info(
                            '[Minitiger Update] Starte automatisches Update:',
                            status.version,
                            status.latestBuild,
                            status.packageType
                        );

                        const accepted =
                            applyUpdate(
                                downloadUrl,
                                status.sha256,
                                status.packageType,
                                status.latestBuild,
                                status.version
                            );

                        if (accepted === false) {
                            setApplying(null);
                            console.warn(
                                '[Minitiger Update] Native Update-Übergabe wurde abgelehnt.'
                            );
                        }
                    })().catch(error => {
                        console.warn(
                            '[Minitiger Update] Privater Update-Check fehlgeschlagen.',
                            error
                        );

                        if (!cancelled) {
                            setApplying(null);
                        }
                    });
                },
                4_000
            );

        return () => {
            cancelled = true;
            window.clearTimeout(
                timer
            );
        };
    }, [
        apiClient,
        user?.Id
    ]);

    if (!applying) {
        return null;
    }

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
                    'rgba(4, 5, 7, 0.88)',
                backdropFilter:
                    'blur(14px)'
            }}
        >
            <div
                style={{
                    maxWidth: '34rem',
                    padding: '1.5rem 1.75rem',
                    borderRadius: '1rem',
                    border:
                        '1px solid rgba(255, 181, 61, 0.35)',
                    background:
                        'rgba(20, 18, 16, 0.96)',
                    textAlign: 'center',
                    boxShadow:
                        '0 1.25rem 4rem rgba(0, 0, 0, 0.45)'
                }}
            >
                <h2
                    style={{
                        margin: 0
                    }}
                >
                    Minitiger wird aktualisiert 🐯
                </h2>

                <p>
                    {applying.version}
                    {' · Build '}
                    {applying.latestBuild}
                    {' wird privat vom Jellyfin-Server geladen.'}
                </p>

                <small>
                    Minitiger Desktop beendet sich gleich,
                    installiert das Update und startet danach
                    automatisch neu.
                </small>
            </div>
        </div>
    );
};

export default MinitigerDesktopUpdateHost;
