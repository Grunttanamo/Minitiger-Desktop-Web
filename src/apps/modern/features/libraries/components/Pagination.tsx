import React, { FC, useCallback } from 'react';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import useMediaQuery from '@mui/material/useMediaQuery';

import globalize from 'lib/globalize';
import type { LibraryViewSettings } from 'types/library';

interface PaginationProps {
    setLibraryViewSettings: React.Dispatch<React.SetStateAction<LibraryViewSettings>>
    index: number
    pageSize: number
    total: number
    disabled?: boolean
}

const scrollLibraryToTop = () => {
    window.scrollTo(0, 0);

    const page =
        document.querySelector<HTMLElement>(
            '.minitigerLibraryPage'
        );

    if (!page) {
        return;
    }

    page.scrollTop = 0;

    page.querySelectorAll<HTMLElement>(
        '.smoothScrollY, .scrollY, .emby-scroller, [data-scrollable="true"]'
    ).forEach(element => {
        element.scrollTop = 0;
    });

    let parent = page.parentElement;
    let depth = 0;

    while (parent && depth < 10) {
        if (parent.scrollTop) {
            parent.scrollTop = 0;
        }

        parent = parent.parentElement;
        depth += 1;
    }
};

const Pagination: FC<PaginationProps> = ({
    setLibraryViewSettings,
    index,
    pageSize,
    total,
    disabled
}) => {
    const isSmallScreen = useMediaQuery(t => t.breakpoints.up('sm'));

    const onNextPageClick = useCallback(() => {
        setLibraryViewSettings((prevState) => ({
            ...prevState,
            StartIndex: index + pageSize
        }));
        scrollLibraryToTop();
    }, [index, pageSize, setLibraryViewSettings]);

    const onPreviousPageClick = useCallback(() => {
        setLibraryViewSettings((prevState) => ({
            ...prevState,
            StartIndex: Math.max(0, index - pageSize)
        }));
        scrollLibraryToTop();
    }, [index, pageSize, setLibraryViewSettings]);

    return (
        <ButtonGroup
            color='inherit'
            variant='text'
            size={isSmallScreen ? undefined : 'small'}
        >
            <Button
                title={globalize.translate('Previous')}
                disabled={disabled || index == 0}
                onClick={onPreviousPageClick}
            >
                <NavigateBeforeIcon />
            </Button>

            <Button
                title={globalize.translate('Next')}
                disabled={disabled || index + pageSize >= total}
                onClick={onNextPageClick}
            >
                <NavigateNextIcon />
            </Button>
        </ButtonGroup>
    );
};

export default Pagination;
