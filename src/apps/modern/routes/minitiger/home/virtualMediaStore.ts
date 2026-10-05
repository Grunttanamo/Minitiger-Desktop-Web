const DB_NAME = 'MinitigerVirtualMedia';
const DB_VERSION = 1;
const STORE_NAME = 'media';

interface StoredVirtualMedia {
    key: string;
    blob: Blob;
    updatedAt: number;
}

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB ist in diesem Client nicht verfügbar.'));
        return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
        const database = request.result;

        if (!database.objectStoreNames.contains(STORE_NAME)) {
            database.createObjectStore(STORE_NAME, {
                keyPath: 'key'
            });
        }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
        request.error ?? new Error('Virtueller Medienspeicher konnte nicht geöffnet werden.')
    );
});

const runTransaction = async <T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>
) => {
    const database = await openDatabase();

    try {
        return await new Promise<T>((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, mode);
            const request = operation(transaction.objectStore(STORE_NAME));

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(
                request.error ?? new Error('Virtueller Medienspeicher: Operation fehlgeschlagen.')
            );
            transaction.onerror = () => reject(
                transaction.error ?? new Error('Virtueller Medienspeicher: Transaktion fehlgeschlagen.')
            );
        });
    } finally {
        database.close();
    }
};

export const getVirtualVideoStorageKey = (libraryId: string) =>
    `virtual-video-${libraryId}`;

export const putVirtualVideo = async (
    libraryId: string,
    file: Blob
) => {
    const key = getVirtualVideoStorageKey(libraryId);

    await runTransaction<IDBValidKey>(
        'readwrite',
        store => store.put({
            key,
            blob: file,
            updatedAt: Date.now()
        } satisfies StoredVirtualMedia)
    );

    return key;
};

export const getVirtualVideo = async (
    key: string
): Promise<Blob | null> => {
    if (!key) {
        return null;
    }

    const result = await runTransaction<StoredVirtualMedia | undefined>(
        'readonly',
        store => store.get(key)
    );

    return result?.blob ?? null;
};

export const deleteVirtualVideo = async (key: string) => {
    if (!key) {
        return;
    }

    await runTransaction<undefined>(
        'readwrite',
        store => store.delete(key) as IDBRequest<undefined>
    );
};


const SERVER_MEDIA_CACHE_PREFIX =
    'server-hover-video-v1';
const SERVER_MEDIA_CACHE_MAX_BYTES =
    32 * 1024 * 1024;
const SERVER_MEDIA_CACHE_MAX_ENTRIES =
    18;

const getAllStoredMedia = async () => {
    const database = await openDatabase();

    try {
        return await new Promise<StoredVirtualMedia[]>((resolve, reject) => {
            const transaction =
                database.transaction(
                    STORE_NAME,
                    'readonly'
                );
            const request =
                transaction
                    .objectStore(
                        STORE_NAME
                    )
                    .getAll();

            request.onsuccess = () =>
                resolve(
                    request.result
                    ?? []
                );
            request.onerror = () =>
                reject(
                    request.error
                    ?? new Error(
                        'Virtueller Medienspeicher konnte nicht gelesen werden.'
                    )
                );
        });
    } finally {
        database.close();
    }
};

const getServerMediaKey = (
    serverId: string,
    libraryId: string,
    revision: number,
    format: string
) => [
    SERVER_MEDIA_CACHE_PREFIX,
    serverId,
    libraryId,
    revision,
    format
].join(':');

export const getCachedVirtualServerVideo = async (
    serverId: string,
    libraryId: string,
    revision: number,
    format: string
): Promise<Blob | null> => {
    if (
        !serverId
        || !libraryId
        || !revision
        || !format
    ) {
        return null;
    }

    return await getVirtualVideo(
        getServerMediaKey(
            serverId,
            libraryId,
            revision,
            format
        )
    );
};

export const cacheVirtualServerVideo = async (
    serverId: string,
    libraryId: string,
    revision: number,
    format: string,
    blob: Blob
) => {
    if (
        !serverId
        || !libraryId
        || !revision
        || !format
        || blob.size <= 0
        || blob.size
            > SERVER_MEDIA_CACHE_MAX_BYTES
    ) {
        return false;
    }

    const key =
        getServerMediaKey(
            serverId,
            libraryId,
            revision,
            format
        );

    await runTransaction<IDBValidKey>(
        'readwrite',
        mediaStore => mediaStore.put({
            key,
            blob,
            updatedAt: Date.now()
        } satisfies StoredVirtualMedia)
    );

    try {
        const all =
            (await getAllStoredMedia())
                .filter(item =>
                    item.key.startsWith(
                        `${SERVER_MEDIA_CACHE_PREFIX}:`
                    )
                )
                .sort(
                    (left, right) =>
                        right.updatedAt
                        - left.updatedAt
                );

        const stale =
            all.slice(
                SERVER_MEDIA_CACHE_MAX_ENTRIES
            );

        for (const item of stale) {
            await runTransaction<undefined>(
                'readwrite',
                mediaStore =>
                    mediaStore.delete(
                        item.key
                    ) as IDBRequest<undefined>
            );
        }
    } catch {
        // Cache pruning is best-effort only.
    }

    return true;
};
