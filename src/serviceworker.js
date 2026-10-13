function getApiClient(serverId) {
    return Promise.resolve(window.connectionManager.getApiClient(serverId));
}

function executeAction(action, data, serverId) {
    return getApiClient(serverId).then(function (apiClient) {
        switch (action) {
            case 'cancel-install':
                return apiClient.cancelPackageInstallation(data.id);
            case 'restart':
                return apiClient.restartServer();
            default:
                clients.openWindow('/');
                return Promise.resolve();
        }
    });
}

/* eslint-disable-next-line no-restricted-globals -- self is valid in a serviceworker environment */
self.addEventListener('notificationclick', function (event) {
    const notification = event.notification;
    notification.close();

    const data = notification.data;
    const serverId = data.serverId;
    const action = event.action;

    if (!action) {
        clients.openWindow('/');
        event.waitUntil(Promise.resolve());
        return;
    }

    event.waitUntil(executeAction(action, data, serverId));
}, false);

/* eslint-disable-next-line no-restricted-globals -- self is valid in a serviceworker environment */
self.addEventListener('activate', () => self.clients.claim());


// Minitiger Desktop image archive: deliberately stored in CacheStorage,
// which belongs to QtWebEngine *persistentStoragePath* and is separate from
// Qt's disposable HTTP cachePath. Windows version-change cache refresh must
// never remove this archive or the user's cookies/localStorage.
const MINITIGER_POSTER_CACHE = 'minitiger-poster-images-v1';
const MAX_POSTERS = 2500;
const KEEP_POSTERS = 2000;
let posterWrites = 0;

self.addEventListener('fetch', event => {
    // Minitiger Desktop bundles this app on its private loopback server.
    // Do not change image caching policy for other Jellyfin Web deployments.
    if (!['127.0.0.1', 'localhost'].includes(self.location.hostname)) return;
    const request = event.request;
    if (request.method !== 'GET' || request.destination !== 'image') return;

    const url = new URL(request.url);
    // Cache only versioned Jellyfin item posters/landscapes.
    // Image tag is part of the key; a changed poster automatically misses.
    if (!/\/Items\/[0-9a-f-]+\/Images\/(Primary|Thumb|Backdrop|Logo)(?:\/|$)/i.test(url.pathname)) return;
    if (!url.searchParams.has('tag')) return;
    // Only cache image URLs bound to an authenticated Jellyfin session.
    // Without a per-user token a shared browser cache could expose a
    // different profile's image if both requested the same item URL.
    const params = Array.from(url.searchParams.keys()).map(key => key.toLowerCase());
    if (!params.some(key => key === 'api_key' || key === 'apikey' || key === 'access_token')) return;

    event.respondWith((async () => {
        const cache = await caches.open(MINITIGER_POSTER_CACHE);
        const stored = await cache.match(request);
        if (stored) return stored;

        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
            // waitUntil keeps the SW alive while the entry is committed;
            // downloading does not block image display.
            event.waitUntil((async () => {
                await cache.put(request, response.clone());
                posterWrites += 1;
                if (posterWrites % 40 === 0) {
                    const keys = await cache.keys();
                    if (keys.length > MAX_POSTERS) {
                        await Promise.all(keys.slice(0, keys.length - KEEP_POSTERS)
                            .map(key => cache.delete(key)));
                    }
                }
            })().catch(error =>
                console.warn('[Minitiger Poster Cache] Konnte Bild nicht speichern', error)
            ));
        }
        return response;
    })());
});
