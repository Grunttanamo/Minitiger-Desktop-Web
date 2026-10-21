import React, { useEffect, useState } from 'react';
import { useApi } from 'hooks/useApi';
import {
    readMinitigerSeason,
    writeMinitigerSeason,
    type MinitigerSeason
} from '../seasonalEvents';

const MinitigerSeasonalSettings = () => {
    const { __legacyApiClient__: apiClient } = useApi();
    const [ season, setSeason ] = useState<MinitigerSeason>('off');
    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState('');
    useEffect(() => {
        if (!apiClient) return;
        let active = true;
        void readMinitigerSeason(apiClient).then(value => {
            if (active) setSeason(value);
        }).catch(() => { if (active) setError('Saisonstatus konnte nicht geladen werden.'); });
        return () => { active = false; };
    }, [apiClient]);
    return (
        <section className='minitigerSettingsCard'>
            <h3>🎃 Saisonale Events</h3>
            <p>Serverweit aktiv: Alle Benutzer erhalten vorübergehend das gewählte Farbdesign und dezente Dekorationen. Persönliche Farb-Einstellungen bleiben gespeichert.</p>
            <label className='minitigerSettingsField'>
                <span>Aktuelles Event</span>
                <select value={season} disabled={busy || !apiClient}
                    onChange={event => {
                        if (!apiClient) return;
                        const next = event.target.value as MinitigerSeason;
                        setBusy(true);
                        setError('');
                        void writeMinitigerSeason(apiClient, next)
                            .then(() => setSeason(next))
                            .catch(() => setError('Speichern fehlgeschlagen – Adminrechte prüfen.'))
                            .finally(() => setBusy(false));
                    }}>
                    <option value='off'>Aus (eigene Farben)</option>
                    <option value='halloween'>🎃 Halloween – Orange / Violett</option>
                    <option value='christmas'>❄️ Weihnachten – Rot / Grün / Schnee</option>
                </select>
            </label>
            {error && <p role='alert'>{error}</p>}
        </section>
    );
};
export default MinitigerSeasonalSettings;
