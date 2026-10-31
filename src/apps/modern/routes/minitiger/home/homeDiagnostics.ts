import type { QueryClient } from '@tanstack/react-query';

// Diagnostics for an empty or broken Home: one compact log line per change,
// prefixed with [Minitiger Diagnose] so it is easy to find in the Desktop
// client log, plus a repair action that drops every local Home cache.

export interface HomeQueryState {
    pending: boolean;
    fetched: boolean;
    error: unknown;
    live: number;
    cached: number;
}

const describeError = (error: unknown) => {
    if (!error) {
        return undefined;
    }

    const value = error as {
        message?: string;
        status?: number;
        response?: { status?: number; statusText?: string };
    };
    const status = value.response?.status ?? value.status;

    return [
        status ? `HTTP ${status}` : '',
        value.response?.statusText ?? '',
        value.message ?? String(error)
    ].filter(Boolean).join(' ');
};

export const summarizeQuery = (state: HomeQueryState) => ({
    state: state.error
        ? 'error'
        : state.pending
            ? 'pending'
            : state.fetched
                ? 'loaded'
                : 'idle',
    live: state.live,
    cached: state.cached,
    ...(state.error ? { error: describeError(state.error) } : {})
});

let lastReport = '';

export const logHomeDiagnostics = (report: Record<string, unknown>) => {
    const line = JSON.stringify(report);

    if (line === lastReport) {
        return;
    }

    lastReport = line;
    console.info(`[Minitiger Diagnose] Startseite ${line}`);
};

// Only caches and snapshots; settings stay untouched because they are
// re-read from the server anyway.
const CACHE_KEY_PATTERN = /^(Minitiger\.HomeItems\.|minitiger\.banner\.)/;

export const repairMinitigerHome = (queryClient: QueryClient) => {
    const removed: string[] = [];

    try {
        for (let index = window.localStorage.length - 1; index >= 0; index--) {
            const key = window.localStorage.key(index);

            if (key && CACHE_KEY_PATTERN.test(key)) {
                window.localStorage.removeItem(key);
                removed.push(key);
            }
        }
    } catch (error) {
        console.warn('[Minitiger Diagnose] Lokale Caches konnten nicht geleert werden.', error);
    }

    console.info(
        `[Minitiger Diagnose] Startseite wird repariert: ${removed.length} lokale Cache-Einträge entfernt, Abfragen werden neu geladen.`
    );

    queryClient.clear();
    window.location.reload();
};
