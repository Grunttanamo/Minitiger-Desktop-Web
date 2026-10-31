// Diagnostics for an empty or broken Home: one compact log line per change,
// prefixed with [Minitiger Diagnose] so it is easy to find in the Desktop
// client log.

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
