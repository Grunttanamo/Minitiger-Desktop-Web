import { useEffect, useMemo, useState } from 'react';

import { useApi } from 'hooks/useApi';

import {
    getMinitigerCastPreference,
    type MinitigerCastPreferenceState
} from '../home/community';

const EMPTY_STATE: MinitigerCastPreferenceState = {
    enabled: false,
    selectedIds: []
};

const useMinitigerCastPreference = (
    itemId?: string | null
) => {
    const { __legacyApiClient__: apiClient } = useApi();
    const [ state, setState ] =
        useState<MinitigerCastPreferenceState>(EMPTY_STATE);
    const [ loading, setLoading ] = useState(false);

    const reload = async () => {
        if (!apiClient || !itemId) {
            setState(EMPTY_STATE);
            return EMPTY_STATE;
        }

        setLoading(true);
        try {
            const next = await getMinitigerCastPreference(
                apiClient,
                itemId
            );
            setState(next);
            return next;
        } catch (error) {
            console.warn(
                '[Minitiger Cast] Auswahl konnte nicht geladen werden.',
                error
            );
            setState(EMPTY_STATE);
            return EMPTY_STATE;
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void reload();
        // itemId/apiClient are the complete source identity here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiClient, itemId]);

    const selectedIdSet = useMemo(
        () => new Set(state.selectedIds),
        [state.selectedIds]
    );

    return {
        state,
        setState,
        loading,
        reload,
        selectedIdSet
    };
};

export default useMinitigerCastPreference;
