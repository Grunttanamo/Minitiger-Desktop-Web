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
    const [fallback, setFallback] = useState(false);
    const [active, setActive] = useState(false);

    useEffect(() => {
        let closed = false;
        let frame = 0;
        let started = false;
        let starting = false;
        let endPoll = 0;
        let sawPlayback = false;
        const owner = ownerRef.current;
        const system = getNative();

        const bounds = () => {
            const rect = elementRef.current?.getBoundingClientRect();
            if (!rect) return null;
            const x = Math.max(0, Math.round(rect.left));
            const y = Math.max(0, Math.round(rect.top));
            const width = Math.max(0, Math.round(rect.width));
            const height = Math.max(0, Math.round(rect.height));
            if (!width || !height || x + width > window.innerWidth + 2
                || y + height > window.innerHeight + 2) return null;
            return { x, y, width, height };
        };
        const move = () => {
            if (closed || window.__minitigerNativePreviewOwner !== owner) return;
            const p = bounds();
            if (p) system?.nativeTrailerPreviewGeometry?.(p.x, p.y, p.width, p.height);
            else {
                // Do not leave an offscreen native decoder playing audio.
                system?.nativeTrailerPreviewStop?.();
                delete window.__minitigerNativePreviewOwner;
                setActive(false);
                return;
            }
            frame = requestAnimationFrame(move);
        };
        const failed = () => {
            if (closed) return;
            if (window.__minitigerNativePreviewOwner === owner) {
                system?.nativeTrailerPreviewStop?.();
                delete window.__minitigerNativePreviewOwner;
            }
            setFallback(true);
        };

        if (!system?.nativeTrailerPreviewAvailable || !system.nativeTrailerPreviewPlay) {
            setFallback(true);
            return;
        }
        const start = (available: boolean) => {
            if (closed || starting || window.__minitigerNativePreviewOwner === owner) return;
            const p = bounds();
            if (!available || !p) { failed(); return; }
            // Only one native surface: newest banner/modal owns it.
            starting = true;
            system.nativeTrailerPreviewStop?.();
            window.__minitigerNativePreviewOwner = owner;
            system.nativeTrailerPreviewPlay!(
                url, loop, p.x, p.y, p.width, p.height, muted, success => {
                    starting = false;
                    if (closed || window.__minitigerNativePreviewOwner !== owner) return;
                    if (!success) { failed(); return; }
                    started = true;
                    setActive(true);
                    onReady();
                    frame = requestAnimationFrame(move);
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
            cancelAnimationFrame(frame);
            window.clearInterval(endPoll);
            if (window.__minitigerNativePreviewOwner === owner) {
                system?.nativeTrailerPreviewStop?.();
                delete window.__minitigerNativePreviewOwner;
                window.dispatchEvent(new Event('minitiger:native-preview-released'));
            }
        };
    }, [url, loop]);

    useEffect(() => {
        if (active && window.__minitigerNativePreviewOwner === ownerRef.current) {
            getNative()?.nativeTrailerPreviewMute?.(muted);
        }
    }, [muted, active]);

    if (fallback) {
        return (
            <video
                className={className}
                src={url}
                autoPlay
                muted={muted}
                loop={loop}
                playsInline
                preload='metadata'
                disablePictureInPicture
                onPlaying={onReady}
                onEnded={onEnded}
                onError={onError}
            />
        );
    }

    return <div ref={elementRef} className={className} aria-hidden='true' />;
};

export default MinitigerNativeTrailerSurface;
