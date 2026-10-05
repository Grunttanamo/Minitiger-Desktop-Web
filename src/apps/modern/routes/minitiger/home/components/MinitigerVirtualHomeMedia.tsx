import type { ApiClient } from 'jellyfin-apiclient';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { MinitigerVirtualLibrary } from '../config/virtualLibraries';
import {
    cacheVirtualServerVideo,
    getCachedVirtualServerVideo,
    getVirtualVideo
} from '../virtualMediaStore';
import { getMinitigerVirtualServerMediaUrl } from '../virtualServerSync';

interface Props {
    library: MinitigerVirtualLibrary;
    apiClient?: ApiClient;
}

const canPlayInlineH264 = () => {
    if (typeof document === 'undefined') {
        return true;
    }

    if (
        typeof navigator !== 'undefined'
        && /jellyfindesktop/i.test(navigator.userAgent)
    ) {
        return false;
    }

    const video = document.createElement('video');
    return Boolean(
        video.canPlayType('video/mp4; codecs="avc1.42E01E"')
    );
};

const MinitigerVirtualHomeMedia = ({
    library,
    apiClient
}: Props) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const previewActiveRef = useRef(false);
    const [ videoUrl, setVideoUrl ] = useState('');
    const [ fallbackVideoUrl, setFallbackVideoUrl ] = useState('');

    const prefersMp4 = useMemo(canPlayInlineH264, []);

    const serverMp4Url = getMinitigerVirtualServerMediaUrl(
        apiClient,
        library.id,
        'video',
        library.videoRevision,
        'mp4'
    );
    const serverWebmUrl = getMinitigerVirtualServerMediaUrl(
        apiClient,
        library.id,
        'video',
        library.videoRevision,
        'webm'
    );
    const imageUrl = getMinitigerVirtualServerMediaUrl(
        apiClient,
        library.id,
        'image',
        library.imageRevision
    ) || library.image;
    const logoUrl = getMinitigerVirtualServerMediaUrl(
        apiClient,
        library.id,
        'logo',
        library.logoRevision
    ) || library.logo;

    useEffect(() => {
        let cancelled = false;
        let objectUrl = '';
        let cacheTimer:
            number
            | undefined;

        if (serverMp4Url || serverWebmUrl) {
            const primaryFormat =
                prefersMp4
                    ? (serverMp4Url ? 'mp4' : 'webm')
                    : (serverWebmUrl ? 'webm' : 'mp4');
            const primary = primaryFormat === 'mp4'
                ? serverMp4Url
                : serverWebmUrl;
            const fallback = primaryFormat === 'mp4'
                ? serverWebmUrl
                : serverMp4Url;
            const serverId =
                apiClient?.serverId()
                ?? '';

            setFallbackVideoUrl(
                fallback
                && fallback !== primary
                    ? fallback
                    : ''
            );

            // Paint immediately from the normal server URL. In parallel try
            // the persistent IndexedDB cache; from the second visit/start the
            // video can then play without a fresh server transfer.
            setVideoUrl(primary);

            void getCachedVirtualServerVideo(
                serverId,
                library.id,
                library.videoRevision ?? 0,
                primaryFormat
            ).then(blob => {
                if (
                    cancelled
                    || !blob
                ) {
                    return;
                }

                objectUrl =
                    URL.createObjectURL(
                        blob
                    );
                setVideoUrl(objectUrl);
                setFallbackVideoUrl('');
            }).catch(() => undefined);

            cacheTimer =
                window.setTimeout(() => {
                    if (
                        cancelled
                        || !primary
                    ) {
                        return;
                    }

                    void fetch(
                        primary,
                        {
                            method: 'GET',
                            cache: 'force-cache'
                        }
                    ).then(async response => {
                        if (
                            cancelled
                            || !response.ok
                        ) {
                            return;
                        }

                        const blob =
                            await response.blob();

                        await cacheVirtualServerVideo(
                            serverId,
                            library.id,
                            library.videoRevision
                                ?? 0,
                            primaryFormat,
                            blob
                        );
                    }).catch(error => {
                        console.debug(
                            '[Minitiger Virtual] Hover-Video Cache-Warmup übersprungen',
                            error
                        );
                    });
                }, 1_500);

            return () => {
                cancelled = true;

                if (
                    cacheTimer
                    !== undefined
                ) {
                    window.clearTimeout(
                        cacheTimer
                    );
                }

                if (objectUrl) {
                    URL.revokeObjectURL(
                        objectUrl
                    );
                }
            };
        }

        setFallbackVideoUrl('');

        if (!library.videoKey) {
            setVideoUrl('');
            return;
        }

        void getVirtualVideo(library.videoKey)
            .then(blob => {
                if (cancelled || !blob) {
                    return;
                }

                objectUrl = URL.createObjectURL(blob);
                setVideoUrl(objectUrl);
            })
            .catch(error => {
                console.warn(
                    '[Minitiger Virtual] MP4 konnte nicht geladen werden',
                    error
                );
            });

        return () => {
            cancelled = true;

            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [
        apiClient,
        library.id,
        library.videoKey,
        library.videoRevision,
        prefersMp4,
        serverMp4Url,
        serverWebmUrl
    ]);

    const startVideo = () => {
        const video = videoRef.current;

        if (!video || !previewActiveRef.current) {
            return;
        }

        void video.play().catch(error => {
            console.debug(
                '[Minitiger Virtual] Hover-Video wartet noch auf spielbare Daten',
                error
            );
        });
    };

    const playPreview = () => {
        previewActiveRef.current = true;

        const video = videoRef.current;
        if (!video) {
            return;
        }

        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            startVideo();
        } else {
            video.load();
        }
    };

    const resetPreview = () => {
        previewActiveRef.current = false;

        const video = videoRef.current;
        if (!video) {
            return;
        }

        video.pause();

        try {
            if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
                video.currentTime = 0;
            }
        } catch {
            // currentTime may still be unavailable while the source changes.
        }
    };

    const prepareFirstFrame = () => {
        const video = videoRef.current;
        if (!video) {
            return;
        }

        if (previewActiveRef.current) {
            startVideo();
            return;
        }

        try {
            video.currentTime = 0.01;
        } catch {
            // Some media engines expose seekability only after canplay.
        }
    };

    const handleVideoError = () => {
        const video = videoRef.current;
        const error = video?.error;

        console.warn(
            '[Minitiger Virtual] Hover-Video konnte nicht wiedergegeben werden',
            {
                code: error?.code,
                message: error?.message,
                source: videoUrl
            }
        );

        if (fallbackVideoUrl && fallbackVideoUrl !== videoUrl) {
            const fallback = fallbackVideoUrl;
            setFallbackVideoUrl('');
            setVideoUrl(fallback);
            return;
        }

        setVideoUrl('');
    };

    return (
        <div
            className='minitigerVirtualHomeImage'
            onMouseEnter={playPreview}
            onMouseLeave={resetPreview}
            onFocus={playPreview}
            onBlur={resetPreview}
        >
            {videoUrl ? (
                <video
                    key={videoUrl}
                    ref={videoRef}
                    className='minitigerVirtualHomeVideo'
                    src={videoUrl}
                    muted
                    loop
                    playsInline
                    preload='auto'
                    disablePictureInPicture
                    onLoadedMetadata={prepareFirstFrame}
                    onCanPlay={startVideo}
                    onError={handleVideoError}
                />
            ) : imageUrl ? (
                <img
                    src={imageUrl}
                    alt=''
                />
            ) : (
                <div className='minitigerVirtualHomeFallback'>
                    {library.name}
                </div>
            )}

            {logoUrl && (
                <img
                    className='minitigerVirtualHomeLogo'
                    src={logoUrl}
                    alt=''
                />
            )}
        </div>
    );
};

export default MinitigerVirtualHomeMedia;
