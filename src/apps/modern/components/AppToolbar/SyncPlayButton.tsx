import React from 'react';
import MinitigerWatchTogetherHost from 'apps/modern/features/minitiger/watchparty/MinitigerWatchTogetherHost';

// The existing Jellyfin SyncPlay toolbar slot is now the single Minitiger
// WatchTogether entry point. The original SyncPlay menu is not mounted.
const SyncPlayButton = () => <MinitigerWatchTogetherHost />;

export default SyncPlayButton;
