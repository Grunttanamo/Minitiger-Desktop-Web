import icon from '../../assets/img/minitiger-icon.png';
import Button from '@mui/material/Button/Button';
import React, { FC } from 'react';
import { Link } from 'react-router-dom';

import { useSystemInfo } from 'hooks/useSystemInfo';

const ServerButton: FC = () => {
    const {
        data: systemInfo,
        isPending
    } = useSystemInfo();

    return (
        <Button
            variant='text'
            size='large'
            color='inherit'
            startIcon={
                <img
                    src={icon}
                    alt=''
                    aria-hidden
                    style={{
                        width: '1.25em',
                        height: '1.25em',
                        objectFit: 'contain',
                        objectPosition: 'center',
                        display: 'block'
                    }}
                />
            }
            component={Link}
            to='/'
        >
            {isPending ? '' : (systemInfo?.ServerName || 'Minitiger')}
        </Button>
    );
};

export default ServerButton;
