import React, { useEffect, useRef, useState } from 'react';
import { useApi } from 'hooks/useApi';
import {
    DEFAULT_HERO_TEXT_BOX, HERO_TEXT_BOX_EVENT, getCachedHeroTextBox,
    readHeroTextBox, writeHeroTextBox, type HeroTextBoxOptions
} from '../heroTextBoxConfig';

const MinitigerHeroTextBoxSettings = () => {
    const { __legacyApiClient__: apiClient } = useApi();
    const [value, setValue] = useState<HeroTextBoxOptions>(getCachedHeroTextBox);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const pending = useRef<number | null>(null);
    const started = useRef(false);
    useEffect(() => {
        if (!apiClient) return;
        let live = true;
        void readHeroTextBox(apiClient).then(result => {
            if (live) { setValue(result); started.current = true; }
        }).catch(() => { if (live) setError('Serverweite Schattenbox-Einstellungen konnten nicht geladen werden.'); });
        return () => { live = false; if (pending.current !== null) window.clearTimeout(pending.current); };
    }, [apiClient]);
    useEffect(() => {
        const onGlobal = (e: Event) => setValue((e as CustomEvent<HeroTextBoxOptions>).detail);
        window.addEventListener(HERO_TEXT_BOX_EVENT, onGlobal);
        return () => window.removeEventListener(HERO_TEXT_BOX_EVENT, onGlobal);
    }, []);
    const change = (patch: Partial<HeroTextBoxOptions>) => {
        const next = { ...value, ...patch };
        setValue(next);
        if (!apiClient || !started.current) return;
        if (pending.current !== null) window.clearTimeout(pending.current);
        pending.current = window.setTimeout(() => {
            setSaving(true);
            setError('');
            void writeHeroTextBox(apiClient, next)
                .catch(() => setError('Speichern fehlgeschlagen – bitte Adminrechte prüfen.'))
                .finally(() => setSaving(false));
        }, 450);
    };
    return <section className='minitigerSettingsCard'>
        <h4>Banner – Info-Schattenbox (für alle Benutzer)</h4>
        <p className='minitigerSettingsHint'>Änderungen werden auf dem Jellyfin-Server gespeichert und gelten automatisch für alle Benutzer. Bereits geöffnete Clients übernehmen sie beim nächsten Abgleich.</p>
        <label className='minitigerSettingsField'>
            <span>Hintergrund-Deckkraft · {value.opacity}%</span>
            <input type='range' min='0' max='100' step='5' value={value.opacity}
                disabled={!apiClient} onChange={e => change({ opacity: Number(e.currentTarget.value) })} />
            <small>0% = durchsichtig, 100% = vollständig dunkel. Standard: 78%.</small>
        </label>
        <label className='minitigerSettingsField'>
            <span>Box-Fade / Randweichheit · {value.edgeSoftness}px</span>
            <input type='range' min='0' max='40' step='1' value={value.edgeSoftness}
                disabled={!apiClient} onChange={e => change({ edgeSoftness: Number(e.currentTarget.value) })} />
            <small>0px = harte Box-Kanten. Höhere Werte lassen die Box selbst von den Rändern nach innen ins Bild ausblenden; Text bleibt scharf.</small>
        </label>
        <button type='button' disabled={!apiClient} onClick={() => change(DEFAULT_HERO_TEXT_BOX)}>Standard wiederherstellen</button>
        {saving && <small>Wird gespeichert …</small>}
        {error && <p role='alert'>{error}</p>}
    </section>;
};
export default MinitigerHeroTextBoxSettings;
