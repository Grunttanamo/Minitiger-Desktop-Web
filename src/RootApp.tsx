import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import React, { type ReactNode } from 'react';

import QueryClientEventHandler from 'components/QueryClientEventHandler';
import { ApiProvider } from 'hooks/useApi';
import { UserSettingsProvider } from 'hooks/useUserSettings';
import { WebConfigProvider } from 'hooks/useWebConfig';
import browser from 'scripts/browser';
import { persister, queryClient } from 'utils/query/queryClient';

import RootAppRouter from 'RootAppRouter';

const useReactQueryDevtools = window.Proxy // '@tanstack/query-devtools' requires 'Proxy', which cannot be polyfilled for legacy browsers
    && !browser.tv; // Don't use devtools on the TV as the navigation is weird

const isMinitigerDesktop = Boolean(
    window.NativeShell
    || /QtWebEngine|Jellyfin(?:\\s+Desktop|MediaPlayer)/i.test(
        navigator.userAgent
    )
);

const MinitigerQueryProvider = ({
    children
}: {
    children: ReactNode;
}) => {
    /*
     * The persistent React Query cache is useful in a regular browser, but
     * QtWebEngine pays a very high price for repeatedly serializing the full
     * query cache into IndexedDB. Minitiger has many large item queries, so
     * normal navigation, home refreshes and editor saves can otherwise turn
     * into seconds-long "Run microtasks" blocks on the native main thread.
     *
     * Keep the normal in-memory QueryClient for the native desktop shell.
     * Browser/Web keeps Jellyfin's persistent cache behavior unchanged.
     */
    if (isMinitigerDesktop) {
        return (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
    }

    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
                buster: __JF_BUILD_VERSION__,
                persister
            }}
        >
            {children}
        </PersistQueryClientProvider>
    );
};

const RootApp = () => (
    <MinitigerQueryProvider>
        <ApiProvider>
            <UserSettingsProvider>
                <WebConfigProvider>
                    <QueryClientEventHandler />
                    <RootAppRouter />
                </WebConfigProvider>
            </UserSettingsProvider>
        </ApiProvider>
        {useReactQueryDevtools && (
            <ReactQueryDevtools initialIsOpen={false} />
        )}
    </MinitigerQueryProvider>
);

export default RootApp;
