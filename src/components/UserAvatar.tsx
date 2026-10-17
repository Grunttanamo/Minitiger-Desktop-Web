import React, { type FC, useEffect, useState } from 'react';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import Avatar, { type AvatarProps } from '@mui/material/Avatar';
import type {} from '@mui/material/themeCssVarsAugmentation';

import { useApi } from 'hooks/useApi';
import useMinitigerAvatarSettings from 'apps/modern/routes/minitiger/home/hooks/useMinitigerAvatarSettings';
import { readMinitigerServerPreference } from 'apps/modern/routes/minitiger/home/serverPreferences';
import { normalizeMinitigerAvatarSettings, parseMinitigerGalleryAvatarReference } from 'apps/modern/routes/minitiger/home/config/avatarSettings';
import { getMinitigerVirtualServerMediaUrl } from 'apps/modern/routes/minitiger/home/virtualServerSync';
import type { MinitigerAvatarSettings } from 'apps/modern/routes/minitiger/home/config/avatarSettings';

interface UserAvatarProps extends AvatarProps {
    user?: UserDto,
    size?: number
}

const UserAvatar: FC<UserAvatarProps> = ({
    user,
    size
}) => {
    const {
        api,
        __legacyApiClient__: apiClient,
        user: currentUser
    } = useApi();
    const {
        settings: minitigerAvatar,
        resolvedImage: minitigerAvatarImage
    } = useMinitigerAvatarSettings();

    const [otherAvatar, setOtherAvatar] = useState<{ image: string; shape: string } | null>(null);
    useEffect(() => {
        if (!apiClient || !user?.Id || currentUser?.Id === user.Id) {
            setOtherAvatar(null);
            return;
        }
        let cancelled = false;
        setOtherAvatar(null);
        void readMinitigerServerPreference<MinitigerAvatarSettings>(apiClient, user.Id, 'avatarSettings')
            .then(value => {
                if (cancelled || !value) return;
                const settings = normalizeMinitigerAvatarSettings(value);
                if (!settings.enabled || !settings.image) return;
                const gallery = parseMinitigerGalleryAvatarReference(settings.image);
                const image = gallery
                    ? getMinitigerVirtualServerMediaUrl(apiClient, gallery.id, 'image', gallery.revision)
                    : settings.image.startsWith('data:image/') ? settings.image : '';
                if (image) setOtherAvatar({ image, shape: settings.shape });
            })
            .catch(() => undefined);
        return () => { cancelled = true; };
    }, [apiClient, user?.Id, currentUser?.Id]);
    const avatarImage = currentUser?.Id === user?.Id
        ? (minitigerAvatar.enabled ? minitigerAvatarImage : '')
        : otherAvatar?.image;
    const avatarShape = currentUser?.Id === user?.Id ? minitigerAvatar.shape : otherAvatar?.shape;
    const useCustomAvatar = Boolean(
        user?.Id
        && avatarImage
    );

    const hasJellyfinImage = Boolean(
        api
        && user?.Id
        && user.PrimaryImageTag
    );

    return user ? (
        <Avatar
            alt={user.Name ?? undefined}
            src={
                useCustomAvatar
                    ? avatarImage
                    : hasJellyfinImage
                        ? `${api?.basePath}/Users/${user.Id}/Images/Primary?tag=${user.PrimaryImageTag}`
                        : undefined
            }
            // eslint-disable-next-line react/jsx-no-bind
            sx={(theme) => ({
                bgcolor:
                    useCustomAvatar || hasJellyfinImage
                        ? theme.vars.palette.background.paper
                        : theme.vars.palette.primary.dark,
                color: 'inherit',
                width: size,
                height: size,
                borderRadius:
                    useCustomAvatar
                        ? avatarShape === 'circle'
                            ? '50%'
                            : '8px'
                        : undefined
            })}
        />
    ) : null;

    /* MINITIGER_PATCH_MARKER: PHASE_18_11_0_TEST_CUSTOM_USER_AVATARS */
    /* MINITIGER_PATCH_MARKER: PHASE_18_12_4_TEST_BANNER_AVATAR_GLOBAL */
};

export default UserAvatar;
