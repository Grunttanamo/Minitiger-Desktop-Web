import React, { useEffect, useRef, useState } from 'react';

type NativePreviewApi = {
    nativeTrailerPreviewAvailable: (callback: (available: boolean) => void) => void;
    nativeTrailerPreviewPlay: (
        url: string, loop: boolean, x: number, y: number, width: number, height: number,
        muted: boolean, callback: (started: boolean) => void
    ) => void;
    nativeTrailerPreviewGeometry: (x: number, y: number, width: number, height: number) => void;
    nativeTrailerPreviewMute: (muted: boolean) => void;
    nativeTrailerPreviewStop: () => void;
    nativeTrailerPreviewEnded: (callback: (ended: boolean) => void) => void;
};

declare global {
    interface Window {
        __minitigerNativePreviewOwner?: string;
    }
}

interface Props {
    url: string;
    className: string;
    muted: boolean;
    loop: boolean;
    onReady: () => void;
    onEnded: () => void;
    onError: () => void;
}

let nextOwnerId = 0;
const getNative = (): Partial<NativePreviewApi> | undefined =>
    (window as unknown as { api?: { system?: Partial<NativePreviewApi> } }).api?.system;

const MinitigerNativeTrailerSurface = ({
    url, className, muted, loop, onReady, onEnded, onError
}: Props) => {
    const elementRef = useRef<HTMLDivElement>(null);
    const ownerRef = useRef(`minitiger-trailer-${++nextOwnerId}`);
    const [failedNative, setFailedNative] = useState(false);
    const [active, setActive] = useState(false);

    useEffect(() => {
        let closed = false;
        let geometryTimer = 0;
        let lastBounds = '';
        let starting = false;
        let endPoll = 0;
        let sawPlayback = false;
        let retries = 0;
        let retryTimer = 0;
        const owner = ownerRef.current;
        const system = getNative();

        const bounds = () => {
            const rect = elementRef.current?.getBoundingClientRect();
            if (!rect) return null;
            // The mpv FBO renders ABOVE Chromium. Reserve the left-side
            // titles/buttons and bottom-right audio/navigation controls;
            // unlike an underlying FBO, it cannot show HTML overlays through
            // its opaque video texture.
            const isHero = className.includes('minitigerHeroTrailerMedia');
            const isLargePreview = className.includes('minitigerLargePreviewTrailerMedia');
            const isOverlay = isHero || isLargePreview;
            const leftCrop = isOverlay ? Math.round(rect.width * (isHero ? 0.34 : 0.28)) : 0;
            const bottomCrop = isOverlay ? Math.round(rect.height * (isHero ? 0.19 : 0.22)) : 0;
            const x = Math.max(0, Math.round(rect.left) + leftCrop);
            const y = Math.max(0, Math.round(rect.top));
            const width = Math.max(0, Math.round(rect.width) - leftCrop);
            const height = Math.max(0, Math.round(rect.height) - bottomCrop);
            if (!width || !height || x + width > window.innerWidth + 2
                || y + height > window.innerHeight + 2) return null;
            return { x, y, width, height };
        };
        const move = () => {
            if (closed || window.__minitigerNativePreviewOwner !== owner) return;
            const p = bounds();
            if (p) {
                const current = [p.x, p.y, p.width, p.height].join(':');
                if (current !== lastBounds) {
                    lastBounds = current;
                    system?.nativeTrailerPreviewGeometry?.(p.x, p.y, p.width, p.height);
                }
            }
            else {
                // Do not leave an offscreen native decoder playing audio.
                system?.nativeTrailerPreviewStop?.();
                delete window.__minitigerNativePreviewOwner;
                setActive(false);
                return;
            }
            geometryTimer = window.setTimeout(move, 200);
        };
        const failed = () => {
            if (closed) return;
            if (window.__minitigerNativePreviewOwner === owner) {
                system?.nativeTrailerPreviewStop?.();
                delete window.__minitigerNativePreviewOwner;
            }
            setFailedNative(true);
            onError();
        };

        if (!system?.nativeTrailerPreviewAvailable || !system.nativeTrailerPreviewPlay) {
            setFailedNative(true);
            onError();
            return;
        }
        const start = (available: boolean) => {
            if (closed || starting || window.__minitigerNativePreviewOwner === owner) return;
            const p = bounds();
            if (!p) { failed(); return; }
            if (!available) {
                // MPV has a real asynchronous QtQuick render-context startup.
                // A missing ready signal is not permission to use HTML5.
                if (retries++ < 35) {
                    retryTimer = window.setTimeout(() => system.nativeTrailerPreviewAvailable?.(start), 200);
                    return;
                }
                failed();
                return;
            }
            // Only one native surface: newest banner/modal owns it.
            starting = true;
            system.nativeTrailerPreviewStop?.();
            window.__minitigerNativePreviewOwner = owner;
            system.nativeTrailerPreviewPlay!(
                url, loop, p.x, p.y, p.width, p.height, muted, success => {
                    starting = false;
                    if (closed || window.__minitigerNativePreviewOwner !== owner) return;
                    if (!success) {
                // Native QML/MPV may still be initializing. Never route a
                // supposedly native trailer into the Qt HTML5 decoder.
                if (retries++ < 24) {
                    if (window.__minitigerNativePreviewOwner === owner) delete window.__minitigerNativePreviewOwner;
                    retryTimer = window.setTimeout(() => system.nativeTrailerPreviewAvailable?.(start), 200);
                    return;
                }
                failed(); return;
            }
                    setActive(true);
                    onReady();
                    geometryTimer = window.setTimeout(move, 200);
                    if (!loop && system.nativeTrailerPreviewEnded) {
                        // EOF is exposed by the native MPV instance, not HTML5.
                        endPoll = window.setInterval(() => {
                            if (closed || window.__minitigerNativePreviewOwner !== owner) return;
                            system.nativeTrailerPreviewEnded?.(ended => {
                                if (closed || window.__minitigerNativePreviewOwner !== owner) return;
                                if (ended && sawPlayback) {
                                    window.clearInterval(endPoll);
                                    onEnded();
                                } else if (!ended) {
                                    sawPlayback = true;
                                }
                            });
                        }, 350);
                    }
                }
            );
        };
        const onReleased = () => {
            if (!closed && !window.__minitigerNativePreviewOwner && elementRef.current?.isConnected) {
                system.nativeTrailerPreviewAvailable?.(start);
            }
        };
        window.addEventListener('minitiger:native-preview-released', onReleased);
        system.nativeTrailerPreviewAvailable(start);
        return () => {
            window.removeEventListener('minitiger:native-preview-released', onReleased);
            closed = true;
            window.clearTimeout(retryTimer);
            window.clearTimeout(geometryTimer);
            window.clearInterval(endPoll);
            if (window.__minitigerNativePreviewOwner === owner) {
                system?.nativeTrailerPreviewStop?.();
                delete window.__minitigerNativePreviewOwner;
                window.dispatchEvent(new Event('minitiger:native-preview-released'));
            }
        };
    }, [url, loop, className]);

    useEffect(() => {
        if (active && window.__minitigerNativePreviewOwner === ownerRef.current) {
            getNative()?.nativeTrailerPreviewMute?.(muted);
        }
    }, [muted, active]);

    if (failedNative) return null;

    return <div ref={elementRef} className={className} aria-hidden='true' />;
};

export default MinitigerNativeTrailerSurface;
