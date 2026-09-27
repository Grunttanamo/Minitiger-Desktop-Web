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

const wait = (milliseconds: number) =>
    new Promise(resolve =>
        window.setTimeout(resolve, milliseconds)
    );

type UpdateOverlayState =
    | {
        phase: 'checking';
        version: string;
    }
    | {
        phase: 'current';
        version: string;
    }
    | {
        phase: 'available';
        status: MinitigerDesktopUpdateStatus;
    }
    | {
        phase: 'error';
        message: string;
    };

const MinitigerDesktopUpdateHost = () => {
    const {
        __legacyApiClient__: apiClient
    } = useApi();

    const [
        overlay,
        setOverlay
    ] = useState<UpdateOverlayState | null>(
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

        // Before the first remembered login there is no safe credential with
        // which the private companion endpoint can be queried. Do not block
        // the login screen in that case; after one successful remembered
        // login the token is restored on every following Desktop start.
        if (!accessToken) {
            return;
        }

        let cancelled = false;

        void (async () => {
            const currentBuild =
                Number(
                    nativeWindow.jmpInfo
                        ?.updateBuild
                    ?? 0
                );

            const currentVersion =
                String(
                    nativeWindow.jmpInfo
                        ?.version
                    ?? ''
                );

            const packageType =
                nativeWindow.jmpInfo
                    ?.portable
                    ? 'portable'
                    : 'installer';

            const showForAtLeast = async (
                startedAt: number,
                minimumMilliseconds: number
            ) => {
                const remaining =
                    minimumMilliseconds
                    - (
                        Date.now()
                        - startedAt
                    );

                if (remaining > 0) {
                    await wait(remaining);
                }
            };

            const checkingStartedAt =
                Date.now();

            setOverlay({
                phase: 'checking',
                version: currentVersion
            });

            console.info(
                '[Minitiger Update] Prüfe privaten Update-Kanal:',
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
                    console.warn(
                        '[Minitiger Update] Erster Status-Check fehlgeschlagen, wiederhole einmal:',
                        response.status
                    );

                    await wait(2_000);

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

                await showForAtLeast(
                    checkingStartedAt,
                    900
                );

                if (cancelled) {
                    return;
                }

                if (
                    !status.enabled
                    || !status.available
                    || status.latestBuild
                        <= currentBuild
                ) {
                    console.info(
                        '[Minitiger Update]',
                        status.message
                        || 'Minitiger Desktop ist aktuell.'
                    );

                    setOverlay({
                        phase: 'current',
                        version:
                            currentVersion
                            || status.version
                    });

                    await wait(1_500);

                    if (!cancelled) {
                        setOverlay(null);
                    }

                    return;
                }

                if (
                    status.latestBuild
                        === failedBuild
                ) {
                    console.warn(
                        '[Minitiger Update] Dieser Build ist zuvor fehlgeschlagen und wird nicht automatisch erneut versucht:',
                        failedBuild
                    );

                    setOverlay({
                        phase: 'error',
                        message:
                            `Build ${failedBuild} ist zuvor fehlgeschlagen. Minitiger startet ohne erneuten Update-Versuch.`
                    });

                    await wait(2_500);

                    if (!cancelled) {
                        setOverlay(null);
                    }

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

                if (cancelled) {
                    return;
                }

                setOverlay({
                    phase: 'available',
                    status
                });

                console.info(
                    '[Minitiger Update] Update gefunden. Übergabe an den nativen Updater erfolgt nach der Hinweisanzeige:',
                    status.version,
                    status.latestBuild,
                    status.packageType
                );

                // Give the user enough time to understand that the application
                // will close and relaunch itself. The native updater exits the
                // process quickly once applyMinitigerUpdate() is called.
                await wait(5_000);

                if (cancelled) {
                    return;
                }

                const accepted =
                    applyUpdate(
                        downloadUrl,
                        status.sha256,
                        status.packageType,
                        status.latestBuild,
                        status.version
                    );

                if (accepted === false) {
                    setOverlay({
                        phase: 'error',
                        message:
                            'Die Übergabe an den nativen Updater wurde abgelehnt. Minitiger läuft normal weiter.'
                    });

                    await wait(2_500);

                    if (!cancelled) {
                        setOverlay(null);
                    }
                }
            } catch (error) {
                console.warn(
                    '[Minitiger Update] Privater Update-Check fehlgeschlagen.',
                    error
                );

                await showForAtLeast(
                    checkingStartedAt,
                    900
                );

                if (!cancelled) {
                    setOverlay({
                        phase: 'error',
                        message:
                            'Update-Prüfung derzeit nicht verfügbar. Minitiger startet normal weiter.'
                    });

                    await wait(1_800);

                    if (!cancelled) {
                        setOverlay(null);
                    }
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        apiClient
    ]);

    if (!overlay) {
        return null;
    }

    const title =
        overlay.phase === 'checking'
            ? 'Update wird geprüft …'
            : overlay.phase === 'current'
                ? 'Minitiger Desktop ist aktuell ✓'
                : overlay.phase === 'available'
                    ? 'Update gefunden 🐯'
                    : 'Update-Hinweis';

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
                    width: 'min(36rem, calc(100vw - 3rem))',
                    padding: '1.65rem 1.9rem',
                    borderRadius: '1rem',
                    border:
                        '1px solid rgba(255, 181, 61, 0.35)',
                    background:
                        'rgba(20, 18, 16, 0.97)',
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
                    {title}
                </h2>

                {overlay.phase === 'checking' && (
                    <p>
                        Minitiger prüft kurz, ob eine neue private
                        Desktop-Version verfügbar ist.
                    </p>
                )}

                {overlay.phase === 'current' && (
                    <p>
                        {overlay.version
                            ? `Version ${overlay.version} ist auf dem neuesten Stand.`
                            : 'Du verwendest bereits die neueste Version.'}
                    </p>
                )}

                {overlay.phase === 'available' && (
                    <>
                        <p>
                            {'Minitiger Desktop '}
                            {overlay.status.version}
                            {' · Build '}
                            {overlay.status.latestBuild}
                            {' ist verfügbar.'}
                        </p>

                        <p>
                            Der Client schließt sich gleich automatisch,
                            installiert das Update und startet danach von
                            selbst wieder.
                        </p>

                        <small>
                            Der Neustart kann einen Moment dauern. Bitte
                            Minitiger in dieser Zeit nicht manuell erneut
                            starten.
                        </small>
                    </>
                )}

                {overlay.phase === 'error' && (
                    <p>
                        {overlay.message}
                    </p>
                )}
            </div>
        </div>
    );
};

export default MinitigerDesktopUpdateHost;
