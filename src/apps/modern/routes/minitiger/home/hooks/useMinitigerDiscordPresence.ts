import { useEffect } from 'react';

import useMinitigerHomeSettings from './useMinitigerHomeSettings';

interface MinitigerWindow extends Window {
    initCompleted?: Promise<unknown>;
}

const useMinitigerDiscordPresence = () => {
    const { settings } = useMinitigerHomeSettings();

    useEffect(() => {
        let cancelled = false;

        const apply = () => {
            if (cancelled) {
                return;
            }

            const configure =
                window.NativeShell
                    ?.configureDiscordPresence;

            if (typeof configure !== 'function') {
                return;
            }

            configure({
                enabled:
                    settings.discordPresenceEnabled,
                clientId:
                    settings.discordApplicationId,
                showTitle:
                    settings.discordPresenceShowTitle,
                showEpisode:
                    settings.discordPresenceShowEpisode,
                showProgress:
                    settings.discordPresenceShowProgress
            });
        };

        const init =
            (window as MinitigerWindow)
                .initCompleted;

        if (init && typeof init.then === 'function') {
            void init.then(apply);
        } else {
            apply();
        }

        return () => {
            cancelled = true;
        };
    }, [
        settings.discordApplicationId,
        settings.discordPresenceEnabled,
        settings.discordPresenceShowEpisode,
        settings.discordPresenceShowProgress,
        settings.discordPresenceShowTitle
    ]);
};

export default useMinitigerDiscordPresence;
