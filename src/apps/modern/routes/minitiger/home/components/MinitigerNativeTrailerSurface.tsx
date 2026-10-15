import React, { useEffect, useRef, useState } from 'react';

type NativePreviewApi = {
    nativeTrailerPreviewAvailable: (callback: (available: boolean) => void) => void;
    nativeTrailerPreviewPlay: (
        url: string, loop: boolean, x: number, y: number, width: number, height: number,
        muted: boolean, callback: (started: boolean) => void
    ) => void;
    nativeTrailerPreviewGeometry: (x: number, y: number, width: number, height: number) => void;
    nativeTrailerPreviewMute: (muted: boolean) => void;
    nativeTrailerPreviewSuspend: (suspended: boolean) => void;
    nativeTrailerPreviewStop: () => void;
    nativeTrailerPreviewEnded: (callback: (ended: boolean) => void) => void;
    nativeTrailerPreviewHasVideo: (callback: (decoded: boolean) => void) => void;
};

declare global {
    interface Window {
        __minitigerNativePreviewOwner?: string;
        __minitigerNativePreviewKind?: 'banner' | 'preview';
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
        let decodedTimer = 0;
        let sawPlayback = false;
        let retries = 0;
        let retryTimer = 0;
        let offscreen = false;
        let registeredTransparency = false;
        let activeContainer: Element | null = null;
        let scrollSuspended = false;
        let scrollResumeTimer = 0;
        let decodedVideo = false;
        const owner = ownerRef.current;
        const isPreview = className.includes('minitigerLargePreviewTrailerMedia');
        const system = getNative();

        const bounds = () => {
            // Qt paints VLC video frames behind WebEngine. Use the exact
            // DOM media CONTAINER, not the CSS-overscanned placeholder or a
            // cropped viewport fragment. Qt naturally clips the FBO at the
            // window edge without changing the video's aspect ratio.
            const element = elementRef.current;
            if (!element) return null;
            const container = element.closest('.minitigerHero, .minitigerLargePreviewHero') || element;
            const rect = container.getBoundingClientRect();
            const x = Math.round(rect.left);
            const y = Math.round(rect.top);
            const width = Math.round(rect.width);
            const height = Math.round(rect.height);
            if (width < 32 || height < 32
                || x >= window.innerWidth || y >= window.innerHeight
                || x + width <= 0 || y + height <= 0) return null;
            return { x, y, width, height };
        };
        const hideCompositing = () => {
            activeContainer?.classList.remove('minitigerNativeTrailerActive');
            document.documentElement.classList.remove('minitigerNativeVideoCompositing');
            document.body.classList.remove('minitigerNativeVideoCompositing');
            registeredTransparency = false;
        };
        const showCompositing = () => {
            if (closed || scrollSuspended || !decodedVideo ||
                window.__minitigerNativePreviewOwner !== owner) return;
            document.querySelectorAll('.minitigerNativeTrailerActive')
                .forEach(element => element.classList.remove('minitigerNativeTrailerActive'));
            activeContainer = elementRef.current?.closest('.minitigerHero, .minitigerLargePreviewHero') || null;
            activeContainer?.classList.add('minitigerNativeTrailerActive');
            document.documentElement.classList.add('minitigerNativeVideoCompositing');
            document.body.classList.add('minitigerNativeVideoCompositing');
            registeredTransparency = true;
        };
        const move = () => {
            if (closed || scrollSuspended || window.__minitigerNativePreviewOwner !== owner) return;
            const p = bounds();
            if (p) {
                const current = [p.x, p.y, p.width, p.height].join(':');
                if (current !== lastBounds) {
                    lastBounds = current;
                    system?.nativeTrailerPreviewGeometry?.(p.x, p.y, p.width, p.height);
                }
            }
            else {
                // Entire container left the viewport: stop and release it.
                if (registeredTransparency) hideCompositing();
                system?.nativeTrailerPreviewStop?.();
                delete window.__minitigerNativePreviewOwner;
                delete window.__minitigerNativePreviewKind;
                offscreen = true;
                setActive(false);
                return;
            }
            geometryTimer = window.setTimeout(move, 200);
        };
        const failed = () => {
            if (closed) return;
            if (registeredTransparency && window.__minitigerNativePreviewOwner === owner) hideCompositing();
            if (window.__minitigerNativePreviewOwner === owner) {
                system?.nativeTrailerPreviewStop?.();
                delete window.__minitigerNativePreviewOwner;
                delete window.__minitigerNativePreviewKind;
                window.dispatchEvent(new Event('minitiger:native-preview-released'));
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
            // An open preview card takes precedence over the background hero.
            // A delayed banner callback must never steal its decoder.
            if (!isPreview && window.__minitigerNativePreviewKind === 'preview'
                && window.__minitigerNativePreviewOwner) return;
            const p = bounds();
            if (!p) { failed(); return; }
            if (!available) {
                // VLC initializes libVLC and its Qt video surface asynchronously.
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
            window.__minitigerNativePreviewKind = isPreview ? 'preview' : 'banner';
            system.nativeTrailerPreviewPlay!(
                url, loop, p.x, p.y, p.width, p.height, muted, success => {
                    starting = false;
                    if (closed || window.__minitigerNativePreviewOwner !== owner) return;
                    if (!success) {
                // The VLC preview surface may still be initializing. Never route a
                // supposedly native trailer into the Qt HTML5 decoder.
                if (retries++ < 24) {
                    if (window.__minitigerNativePreviewOwner === owner) {
                        delete window.__minitigerNativePreviewOwner;
                        delete window.__minitigerNativePreviewKind;
                    }
                    retryTimer = window.setTimeout(() => system.nativeTrailerPreviewAvailable?.(start), 200);
                    return;
                }
                failed(); return;
            }
                    setActive(true);
                    geometryTimer = window.setTimeout(move, 200);
                    // A successful "loadfile" command is NOT a decoded frame.
                    // Keep the backdrop until the real libVLC decoder reports
                    // a video track, instead of claiming playback too early.
                    if (!system.nativeTrailerPreviewHasVideo) {
                        failed();
                        return;
                    }
                    let checks = 0;
                    decodedTimer = window.setInterval(() => {
                        // Scrolling intentionally pauses the native decoder.
                        // Do not count those frames as decoding failures.
                        if (scrollSuspended) return;
                        if (closed || window.__minitigerNativePreviewOwner !== owner) {
                            window.clearInterval(decodedTimer);
                            return;
                        }
                        system.nativeTrailerPreviewHasVideo?.(decoded => {
                            if (closed || window.__minitigerNativePreviewOwner !== owner) return;
                            if (decoded) {
                                window.clearInterval(decodedTimer);
                                decodedVideo = true;
                                showCompositing();
                                onReady();
                            } else if (++checks >= 48) {
                                window.clearInterval(decodedTimer);
                                failed();
                            }
                        });
                    }, 250);
                    if (!loop && system.nativeTrailerPreviewEnded) {
                        // EOF is exposed by the native VLC instance, not HTML5.
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
        const resumeAfterScroll = () => {
            scrollResumeTimer = 0;
            if (closed) return;
            if (offscreen) {
                if (bounds() && !window.__minitigerNativePreviewOwner) {
                    offscreen = false;
                    system?.nativeTrailerPreviewAvailable?.(start);
                }
                return;
            }
            if (!scrollSuspended || window.__minitigerNativePreviewOwner !== owner) return;
            const p = bounds();
            if (!p) {
                // Fully offscreen: leave native decoding off and show artwork.
                hideCompositing();
                scrollSuspended = false;
                system?.nativeTrailerPreviewStop?.();
                delete window.__minitigerNativePreviewOwner;
                delete window.__minitigerNativePreviewKind;
                window.dispatchEvent(new Event('minitiger:native-preview-released'));
                offscreen = true;
                setActive(false);
                return;
            }
            // Only ONE geometry update, after scroll has completely settled.
            const current = [p.x, p.y, p.width, p.height].join(':');
            system?.nativeTrailerPreviewGeometry?.(p.x, p.y, p.width, p.height);
            lastBounds = current;
            scrollSuspended = false;
            system?.nativeTrailerPreviewSuspend?.(false);
            showCompositing();
            geometryTimer = window.setTimeout(move, 250);
        };
        const scrollIntent = () => {
            if (closed) return;
            window.clearTimeout(scrollResumeTimer);
            if (window.__minitigerNativePreviewOwner === owner && system?.nativeTrailerPreviewSuspend) {
                if (!scrollSuspended) {
                    scrollSuspended = true;
                    window.clearTimeout(geometryTimer);
                    // Hide the FBO and restore the normal Chromium backdrop
                    // BEFORE the scroll frame is composited, avoiding stale
                    // texture copies all over the home screen.
                    if (registeredTransparency) hideCompositing();
                    system?.nativeTrailerPreviewSuspend?.(true);
                }
            }
            if (scrollSuspended || offscreen)
                scrollResumeTimer = window.setTimeout(resumeAfterScroll, 420);
        };
        const onReleased = () => {
            if (!closed && !window.__minitigerNativePreviewOwner && elementRef.current?.isConnected
                && bounds()) {
                offscreen = false;
                system.nativeTrailerPreviewAvailable?.(start);
            }
        };
        // Capture wheel/touch input before Chromium draws the next scroll frame.
        window.addEventListener('wheel', scrollIntent, { capture: true, passive: true });
        window.addEventListener('touchmove', scrollIntent, { capture: true, passive: true });
        const scrollKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key))
                scrollIntent();
        };
        window.addEventListener('keydown', scrollKey, true);
        window.addEventListener('resize', scrollIntent);
        window.addEventListener('scroll', scrollIntent, true);
        window.addEventListener('minitiger:native-preview-released', onReleased);
        system.nativeTrailerPreviewAvailable(start);
        return () => {
            window.removeEventListener('minitiger:native-preview-released', onReleased);
            window.removeEventListener('wheel', scrollIntent, true);
            window.removeEventListener('touchmove', scrollIntent, true);
            window.removeEventListener('keydown', scrollKey, true);
            window.removeEventListener('resize', scrollIntent);
            window.removeEventListener('scroll', scrollIntent, true);
            closed = true;
            window.clearTimeout(retryTimer);
            window.clearTimeout(scrollResumeTimer);
            window.clearTimeout(geometryTimer);
            window.clearInterval(decodedTimer);
            window.clearInterval(endPoll);
            if (registeredTransparency && window.__minitigerNativePreviewOwner === owner) hideCompositing();
            if (window.__minitigerNativePreviewOwner === owner) {
                system?.nativeTrailerPreviewStop?.();
                delete window.__minitigerNativePreviewOwner;
                delete window.__minitigerNativePreviewKind;
                window.dispatchEvent(new Event('minitiger:native-preview-released'));
            }
        };
    }, [url, loop]);

    useEffect(() => {
        if (active && window.__minitigerNativePreviewOwner === ownerRef.current) {
            getNative()?.nativeTrailerPreviewMute?.(muted);
        }
    }, [muted, active]);

    if (failedNative) return null;

    return <div ref={elementRef} className={`${className} minitigerNativeTrailerSurface`} aria-hidden='true' />;
};

export default MinitigerNativeTrailerSurface;
