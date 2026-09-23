import React, { type FC } from 'react';

import { useItem } from 'hooks/useItem';
import { useUserSettings } from 'hooks/useUserSettings';

import { useLibrary } from '../hooks/useLibrary';

const cleanLibraryName = (value?: string | null) => {
    const name = String(value ?? '').trim();

    if (!name) {
        return 'Bibliothek';
    }

    return name.replace(/^\s*\d+\.\s*/, '');
};

const LibraryToolbar: FC = () => {
    const {
        id: parentId,
        content,
        isLibraryPath,
        itemsResult,
        viewSettings
    } = useLibrary();

    const {
        data: item
    } = useItem(parentId || undefined);

    if (!isLibraryPath) {
        return null;
    }

    const totalRecordCount =
        itemsResult?.data?.TotalRecordCount ?? 0;

    const { libraryPageSize } = useUserSettings();
    const startIndex = viewSettings?.StartIndex ?? 0;
    const paginationEnabled =
        Boolean(content?.isPaginationEnabled)
        && libraryPageSize > 0
        && totalRecordCount > libraryPageSize;

    const rangeStart =
        totalRecordCount > 0
            ? startIndex + 1
            : 0;

    const rangeEnd = paginationEnabled
        ? Math.min(
            startIndex + libraryPageSize,
            totalRecordCount
        )
        : totalRecordCount;

    const countLabel = itemsResult?.isPending
        ? '…'
        : paginationEnabled
            ? `${rangeStart.toLocaleString('de-DE')}–${rangeEnd.toLocaleString('de-DE')} von ${totalRecordCount.toLocaleString('de-DE')} Inhalte`
            : `${totalRecordCount.toLocaleString('de-DE')} Inhalte`;

    return (
        <div className='minitigerLibraryTopbar'>
            <h1>
                {cleanLibraryName(item?.Name)}
            </h1>

            <span className='minitigerLibraryCount'>
                {countLabel}
            </span>
        </div>
    );
};

export default LibraryToolbar;
