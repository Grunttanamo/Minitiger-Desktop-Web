import React from 'react';

import { useApi } from 'hooks/useApi';

import type { ItemDto } from 'types/base/models/item-dto';

import {
    getLanguageFlagUrl,
    getStreamLanguages
} from '../home/mediaUtils';
import {
    useMinitigerLanguageFlags
} from '../home/minitigerLanguageFlags';

interface Props {
    item?: ItemDto;
    enabled: boolean;
    className?: string;
    maxFlags?: number;
}

const MinitigerDetailAudioFlags = ({
    item,
    enabled,
    className = '',
    maxFlags = 4
}: Props) => {
    const {
        __legacyApiClient__: apiClient
    } = useApi();

    const manualLanguages =
        useMinitigerLanguageFlags(
            apiClient,
            item?.Id
        );

    if (!enabled || !item) {
        return null;
    }

    const flags = getStreamLanguages(
        item,
        'Audio',
        manualLanguages
    )
        .map(language => ({
            language,
            url: getLanguageFlagUrl(language)
        }))
        .filter(flag => Boolean(flag.url))
        .slice(0, maxFlags);

    if (flags.length === 0) {
        return null;
    }

    return (
        <div
            className={[
                'minitigerDetailAudioFlags',
                className
            ].filter(Boolean).join(' ')}
            aria-label='Audiosprachen'
        >
            {flags.map((flag, index) => (
                <img
                    key={`${flag.language}-${index}`}
                    src={flag.url ?? undefined}
                    alt={flag.language}
                    title={flag.language}
                    onError={event => {
                        event.currentTarget.style.display = 'none';
                    }}
                />
            ))}
        </div>
    );
};

export default MinitigerDetailAudioFlags;
