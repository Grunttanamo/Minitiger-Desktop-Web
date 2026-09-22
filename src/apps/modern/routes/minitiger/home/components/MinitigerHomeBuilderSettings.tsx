import React, { useState } from 'react';

import type { ItemDto } from 'types/base/models/item-dto';

import {
    type MinitigerCustomDisplay,
    type MinitigerCustomRow,
    type MinitigerCustomRowsConfig,
    type MinitigerCustomSortMode
} from '../config/customRows';
import {
    HOME_ROW_LABELS,
    isCustomHomeRowId,
    isSystemHomeRowId,
    isVirtualHomeRowId,
    type HomeRowId,
    type HomeSectionId,
    type MinitigerHomeSettings,
    type VirtualHomeRowId
} from '../config/homeSettings';
import {
    type MinitigerVirtualDisplay,
    type MinitigerVirtualLibrariesConfig,
    type MinitigerVirtualRowId
} from '../config/virtualLibraries';

interface MinitigerHomeBuilderSettingsProps {
    disabled?: boolean;
    settings: MinitigerHomeSettings;
    libraries: ItemDto[];
    customConfig: MinitigerCustomRowsConfig;
    virtualConfig: MinitigerVirtualLibrariesConfig;
    onUpdateSettings: (
        patch: Partial<MinitigerHomeSettings>
    ) => void;
    onToggleSection: (sectionId: HomeSectionId) => void;
    onMoveHomeRow: (
        rowId: HomeRowId,
        direction: -1 | 1
    ) => void;
    onReorderHomeRows: (
        sourceId: HomeRowId,
        targetId: HomeRowId
    ) => void;
    onUpdateCustomRow: (
        rowKey: string,
        patch: Partial<Omit<MinitigerCustomRow, 'key'>>
    ) => void;
    onToggleVirtualRow: (
        rowId: MinitigerVirtualRowId
    ) => void;
    onUpdateVirtualRowTitle: (
        rowId: MinitigerVirtualRowId,
        title: string
    ) => void;
    onSetVirtualRowTitleVisible: (
        rowId: MinitigerVirtualRowId,
        visible: boolean
    ) => void;
    onSetVirtualHomeCardWidth: (
        width: number
    ) => void;
    onAddVirtualLibrary: () => void;
    onUpdateVirtualLibrary: (
        libraryId: string,
        patch: Partial<{
            name: string;
            image: string;
            display: MinitigerVirtualDisplay;
            enabled: boolean;
            showCaption: boolean;
        }>
    ) => void;
    onRemoveVirtualLibrary: (
        libraryId: string
    ) => void;
    onMoveVirtualLibrary: (
        libraryId: string,
        direction: -1 | 1
    ) => void;
}

const parseCustomDisplay = (
    value: string
): MinitigerCustomDisplay => (
    value === 'landscape'
        ? 'landscape'
        : 'poster'
);

const parseCustomSort = (
    value: string
): MinitigerCustomSortMode => (
    value === 'latestTitles'
        ? 'latestTitles'
        : value === 'latestSeasons'
            ? 'latestSeasons'
            : 'latestItems'
);

const LibrarySelect = ({
    value,
    libraries,
    onChange
}: {
    value: string;
    libraries: ItemDto[];
    onChange: (value: string) => void;
}) => (
    <select
        value={value}
        onChange={event =>
            onChange(event.currentTarget.value)
        }
    >
        <option value=''>— Keine —</option>
        {libraries.map(library => (
            <option
                key={library.Id ?? library.Name}
                value={library.Id ?? ''}
            >
                {library.Name ?? 'Bibliothek'}
            </option>
        ))}
    </select>
);

const MinitigerHomeBuilderSettings = ({
    disabled = false,
    settings,
    libraries,
    customConfig,
    virtualConfig,
    onUpdateSettings,
    onToggleSection,
    onMoveHomeRow,
    onReorderHomeRows,
    onUpdateCustomRow,
    onToggleVirtualRow,
    onUpdateVirtualRowTitle,
    onSetVirtualRowTitleVisible,
    onSetVirtualHomeCardWidth,
    onAddVirtualLibrary,
    onUpdateVirtualLibrary,
    onRemoveVirtualLibrary,
    onMoveVirtualLibrary
}: MinitigerHomeBuilderSettingsProps) => {
    const customByKey = new Map(
        customConfig.rows.map(row => [
            row.key,
            row
        ])
    );

    const [ draggedRow, setDraggedRow ] =
        useState<HomeRowId | null>(null);
    const [ dragTarget, setDragTarget ] =
        useState<HomeRowId | null>(null);

    const dragHandleProps = (rowId: HomeRowId) => ({
        draggable: true,
        onDragStart: (
            event: React.DragEvent<HTMLSpanElement>
        ) => {
            setDraggedRow(rowId);
            setDragTarget(null);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(
                'text/plain',
                rowId
            );
        },
        onDragEnd: () => {
            setDraggedRow(null);
            setDragTarget(null);
        }
    });

    const dropTargetProps = (rowId: HomeRowId) => ({
        onDragOver: (
            event: React.DragEvent<HTMLDivElement>
        ) => {
            event.preventDefault();

            if (
                draggedRow
                && draggedRow !== rowId
            ) {
                setDragTarget(rowId);
                event.dataTransfer.dropEffect = 'move';
            }
        },
        onDragLeave: (
            event: React.DragEvent<HTMLDivElement>
        ) => {
            if (
                !event.currentTarget.contains(
                    event.relatedTarget as Node | null
                )
                && dragTarget === rowId
            ) {
                setDragTarget(null);
            }
        },
        onDrop: (
            event: React.DragEvent<HTMLDivElement>
        ) => {
            event.preventDefault();

            const source = (
                draggedRow
                ?? event.dataTransfer.getData(
                    'text/plain'
                )
            ) as HomeRowId;

            if (
                source
                && source !== rowId
            ) {
                onReorderHomeRows(
                    source,
                    rowId
                );
            }

            setDraggedRow(null);
            setDragTarget(null);
        }
    });

    const getDragClass = (
        rowId: HomeRowId
    ) => [
        draggedRow === rowId
            ? 'isDragging'
            : '',
        dragTarget === rowId
            ? 'isDragTarget'
            : ''
    ].filter(Boolean).join(' ');

    const orderedVirtualLibraries =
        virtualConfig.homeOrder
            .map(id =>
                virtualConfig.libraries.find(
                    library => library.id === id
                )
            )
            .filter((
                library
            ): library is NonNullable<typeof library> => (
                Boolean(library)
            ));

    const getVirtualCount = (
        rowId: VirtualHomeRowId
    ) => {
        const index = Number(
            rowId.replace('virtual', '')
        ) - 1;

        return orderedVirtualLibraries
            .slice(index * 4, index * 4 + 4)
            .filter(library => library.enabled)
            .length;
    };

    return (
        <fieldset
            className='minitigerHomeBuilderDisabledScope'
            disabled={disabled}
        >
            <section className='minitigerSettingsCard'>
                <h4>Custom Startseiten-Reihen</h4>

                <div className='minitigerHomeBuilderIntro'>
                    Die Medien-Bibliotheken bleiben immer direkt unter
                    dem Banner bzw. ganz oben. Alle anderen System-,
                    Custom- und virtuellen Reihen können jetzt gemeinsam
                    frei hoch/runter sortiert werden.
                </div>

                <div className='minitigerHomeStaticRow'>
                    <label className='minitigerSettingsToggle'>
                        <input
                            type='checkbox'
                            checked={
                                settings.visibleSections.libraries
                            }
                            onChange={() =>
                                onToggleSection('libraries')
                            }
                        />
                        <span>
                            <strong>Medien-Bibliotheken</strong>
                            <small>
                                Immer die erste Reihe. Aktivierbar,
                                aber nicht verschiebbar.
                            </small>
                        </span>
                    </label>
                </div>

                <div className='minitigerHomeBuilderList'>
                    {settings.homeRowOrder.map((
                        rowId,
                        index
                    ) => {
                        if (isSystemHomeRowId(rowId)) {
                            return (
                                <div
                                    key={rowId}
                                    {...dropTargetProps(rowId)}
                                    className={[
                                        'minitigerHomeBuilderRow',
                                        getDragClass(rowId)
                                    ].filter(Boolean).join(' ')}
                                >
                                    <div className='minitigerHomeBuilderHead'>
                                        <span
                                            className='minitigerDragHandle'
                                            title='Reihe verschieben'
                                            aria-label='Reihe verschieben'
                                            {...dragHandleProps(rowId)}
                                        >
                                            ☰
                                        </span>

                                        <label>
                                            <input
                                                type='checkbox'
                                                checked={
                                                    settings.visibleSections[
                                                        rowId
                                                    ]
                                                }
                                                onChange={() =>
                                                    onToggleSection(
                                                        rowId
                                                    )
                                                }
                                            />
                                            <strong>
                                                {
                                                    HOME_ROW_LABELS[
                                                        rowId
                                                    ]
                                                }
                                            </strong>
                                        </label>

                                        <span className='minitigerHomeBuilderMeta'>
                                            System-Reihe · {
                                                settings.systemRowCardScale[
                                                    rowId
                                                ]
                                            }% · {
                                                settings.systemRowGap[
                                                    rowId
                                                ]
                                            }px
                                        </span>

                                        <div className='minitigerHomeBuilderMove'>
                                            <button
                                                type='button'
                                                disabled={index === 0}
                                                onClick={() =>
                                                    onMoveHomeRow(
                                                        rowId,
                                                        -1
                                                    )
                                                }
                                            >
                                                ↑
                                            </button>
                                            <button
                                                type='button'
                                                disabled={
                                                    index
                                                    === settings.homeRowOrder.length - 1
                                                }
                                                onClick={() =>
                                                    onMoveHomeRow(
                                                        rowId,
                                                        1
                                                    )
                                                }
                                            >
                                                ↓
                                            </button>
                                        </div>
                                    </div>

                                    <details className='minitigerHomeBuilderDetails'>
                                        <summary>
                                            Reihe konfigurieren
                                        </summary>

                                        <div className='minitigerHomeBuilderGrid'>
                                            <label className='minitigerRangeField'>
                                                <span>Kartengröße</span>
                                                <div>
                                                    <input
                                                        type='range'
                                                        min='60'
                                                        max='160'
                                                        step='5'
                                                        value={
                                                            settings
                                                                .systemRowCardScale[
                                                                    rowId
                                                                ]
                                                        }
                                                        onChange={event =>
                                                            onUpdateSettings({
                                                                systemRowCardScale: {
                                                                    ...settings.systemRowCardScale,
                                                                    [rowId]:
                                                                        Number(
                                                                            event.currentTarget.value
                                                                        )
                                                                }
                                                            })
                                                        }
                                                    />
                                                    <output>
                                                        {
                                                            settings
                                                                .systemRowCardScale[
                                                                    rowId
                                                                ]
                                                        }%
                                                    </output>
                                                </div>
                                            </label>

                                            <label className='minitigerRangeField'>
                                                <span>Kartenabstand</span>
                                                <div>
                                                    <input
                                                        type='range'
                                                        min='4'
                                                        max='48'
                                                        step='1'
                                                        value={
                                                            settings
                                                                .systemRowGap[
                                                                    rowId
                                                                ]
                                                        }
                                                        onChange={event =>
                                                            onUpdateSettings({
                                                                systemRowGap: {
                                                                    ...settings.systemRowGap,
                                                                    [rowId]:
                                                                        Number(
                                                                            event.currentTarget.value
                                                                        )
                                                                }
                                                            })
                                                        }
                                                    />
                                                    <output>
                                                        {
                                                            settings
                                                                .systemRowGap[
                                                                    rowId
                                                                ]
                                                        }px
                                                    </output>
                                                </div>
                                            </label>
                                        </div>
                                    </details>
                                </div>
                            );
                        }

                        if (isVirtualHomeRowId(rowId)) {
                            const count =
                                getVirtualCount(rowId);

                            return (
                                <div
                                    key={rowId}
                                    {...dropTargetProps(rowId)}
                                    className={[
                                        'minitigerHomeBuilderRow',
                                        'isVirtual',
                                        getDragClass(rowId)
                                    ].filter(Boolean).join(' ')}
                                >
                                    <div className='minitigerHomeBuilderHead'>
                                        <span
                                            className='minitigerDragHandle'
                                            title='Reihe verschieben'
                                            aria-label='Reihe verschieben'
                                            {...dragHandleProps(rowId)}
                                        >
                                            ☰
                                        </span>

                                        <label>
                                            <input
                                                type='checkbox'
                                                checked={
                                                    virtualConfig
                                                        .rowEnabled[
                                                            rowId
                                                        ]
                                                }
                                                onChange={() =>
                                                    onToggleVirtualRow(
                                                        rowId
                                                    )
                                                }
                                            />
                                            <strong>
                                                {
                                                    virtualConfig
                                                        .rowTitles[
                                                            rowId
                                                        ]
                                                    || 'Virtuelle Bibliotheken'
                                                }
                                            </strong>
                                        </label>

                                        <span className='minitigerHomeBuilderMeta'>
                                            Virtuell · {count}/4
                                        </span>

                                        <div className='minitigerHomeBuilderMove'>
                                            <button
                                                type='button'
                                                disabled={index === 0}
                                                onClick={() =>
                                                    onMoveHomeRow(
                                                        rowId,
                                                        -1
                                                    )
                                                }
                                            >
                                                ↑
                                            </button>
                                            <button
                                                type='button'
                                                disabled={
                                                    index
                                                    === settings.homeRowOrder.length - 1
                                                }
                                                onClick={() =>
                                                    onMoveHomeRow(
                                                        rowId,
                                                        1
                                                    )
                                                }
                                            >
                                                ↓
                                            </button>
                                        </div>
                                    </div>

                                    <details className='minitigerHomeBuilderDetails'>
                                        <summary>Reihe konfigurieren</summary>

                                        <div className='minitigerHomeBuilderGrid'>
                                            <label className='minitigerSettingsField'>
                                                <span>Reihenname</span>
                                                <input
                                                    type='text'
                                                    value={
                                                        virtualConfig
                                                            .rowTitles[
                                                                rowId
                                                            ]
                                                    }
                                                    onChange={event =>
                                                        onUpdateVirtualRowTitle(
                                                            rowId,
                                                            event.currentTarget.value
                                                        )
                                                    }
                                                />
                                            </label>

                                            <label className='minitigerSettingsToggle'>
                                                <input
                                                    type='checkbox'
                                                    checked={
                                                        virtualConfig
                                                            .rowTitleVisible[
                                                                rowId
                                                            ]
                                                    }
                                                    onChange={event =>
                                                        onSetVirtualRowTitleVisible(
                                                            rowId,
                                                            event.currentTarget.checked
                                                        )
                                                    }
                                                />
                                                <span>
                                                    <strong>
                                                        Reihenname oben anzeigen
                                                    </strong>
                                                </span>
                                            </label>
                                        </div>
                                    </details>
                                </div>
                            );
                        }

                        if (isCustomHomeRowId(rowId)) {
                            const row =
                                customByKey.get(rowId);

                            if (!row) {
                                return null;
                            }

                            return (
                                <div
                                    key={rowId}
                                    {...dropTargetProps(rowId)}
                                    className={[
                                        'minitigerHomeBuilderRow',
                                        'isCustom',
                                        getDragClass(rowId)
                                    ].filter(Boolean).join(' ')}
                                >
                                    <div className='minitigerHomeBuilderHead'>
                                        <span
                                            className='minitigerDragHandle'
                                            title='Reihe verschieben'
                                            aria-label='Reihe verschieben'
                                            {...dragHandleProps(rowId)}
                                        >
                                            ☰
                                        </span>

                                        <label>
                                            <input
                                                type='checkbox'
                                                checked={row.enabled}
                                                onChange={event =>
                                                    onUpdateCustomRow(
                                                        row.key,
                                                        {
                                                            enabled:
                                                                event.currentTarget.checked
                                                        }
                                                    )
                                                }
                                            />
                                            <strong>
                                                {row.title}
                                            </strong>
                                        </label>

                                        <span className='minitigerHomeBuilderMeta'>
                                            Custom · {
                                                row.sortMode === 'latestSeasons'
                                                    ? 'Staffelposter'
                                                    : row.display === 'landscape'
                                                        ? 'Landscape'
                                                        : 'Poster'
                                            } · {row.count}
                                            · {row.cardScale}%
                                            · {row.gap}px
                                        </span>

                                        <div className='minitigerHomeBuilderMove'>
                                            <button
                                                type='button'
                                                disabled={index === 0}
                                                onClick={() =>
                                                    onMoveHomeRow(
                                                        rowId,
                                                        -1
                                                    )
                                                }
                                            >
                                                ↑
                                            </button>
                                            <button
                                                type='button'
                                                disabled={
                                                    index
                                                    === settings.homeRowOrder.length - 1
                                                }
                                                onClick={() =>
                                                    onMoveHomeRow(
                                                        rowId,
                                                        1
                                                    )
                                                }
                                            >
                                                ↓
                                            </button>
                                        </div>
                                    </div>

                                    <details className='minitigerHomeBuilderDetails'>
                                        <summary>
                                            Reihe konfigurieren
                                        </summary>

                                        <div className='minitigerHomeBuilderGrid'>
                                            <label className='minitigerSettingsField isWide'>
                                                <span>Titel der Reihe</span>
                                                <input
                                                    type='text'
                                                    value={row.title}
                                                    onChange={event =>
                                                        onUpdateCustomRow(
                                                            row.key,
                                                            {
                                                                title:
                                                                    event.currentTarget.value
                                                            }
                                                        )
                                                    }
                                                />
                                            </label>

                                            <label className='minitigerSettingsToggle isWide'>
                                                <input
                                                    type='checkbox'
                                                    checked={row.showTitle}
                                                    onChange={event =>
                                                        onUpdateCustomRow(
                                                            row.key,
                                                            {
                                                                showTitle:
                                                                    event.currentTarget.checked
                                                            }
                                                        )
                                                    }
                                                />
                                                <span>
                                                    <strong>Titel der Reihe anzeigen</strong>
                                                </span>
                                            </label>

                                            <label className='minitigerRangeField'>
                                                <span>Kartengröße</span>
                                                <div>
                                                    <input
                                                        type='range'
                                                        min='60'
                                                        max='160'
                                                        step='5'
                                                        value={row.cardScale}
                                                        onChange={event =>
                                                            onUpdateCustomRow(
                                                                row.key,
                                                                {
                                                                    cardScale:
                                                                        Number(
                                                                            event.currentTarget.value
                                                                        )
                                                                }
                                                            )
                                                        }
                                                    />
                                                    <output>{row.cardScale}%</output>
                                                </div>
                                            </label>

                                            <label className='minitigerRangeField'>
                                                <span>Kartenabstand</span>
                                                <div>
                                                    <input
                                                        type='range'
                                                        min='4'
                                                        max='48'
                                                        step='1'
                                                        value={row.gap}
                                                        onChange={event =>
                                                            onUpdateCustomRow(
                                                                row.key,
                                                                {
                                                                    gap:
                                                                        Number(
                                                                            event.currentTarget.value
                                                                        )
                                                                }
                                                            )
                                                        }
                                                    />
                                                    <output>{row.gap}px</output>
                                                </div>
                                            </label>

                                            <label className='minitigerSettingsField'>
                                                <span>
                                                    Inhalt der Reihe 1
                                                </span>
                                                <LibrarySelect
                                                    value={row.library1}
                                                    libraries={libraries}
                                                    onChange={value =>
                                                        onUpdateCustomRow(
                                                            row.key,
                                                            {
                                                                library1:
                                                                    value
                                                            }
                                                        )
                                                    }
                                                />
                                            </label>

                                            <label className='minitigerSettingsField'>
                                                <span>
                                                    Inhalt der Reihe 2
                                                    (optional)
                                                </span>
                                                <LibrarySelect
                                                    value={row.library2}
                                                    libraries={libraries}
                                                    onChange={value =>
                                                        onUpdateCustomRow(
                                                            row.key,
                                                            {
                                                                library2:
                                                                    value
                                                            }
                                                        )
                                                    }
                                                />
                                            </label>

                                            <label className='minitigerSettingsField'>
                                                <span>Sortierregel</span>
                                                <select
                                                    value={row.sortMode}
                                                    onChange={event =>
                                                        onUpdateCustomRow(
                                                            row.key,
                                                            {
                                                                sortMode:
                                                                    parseCustomSort(
                                                                        event.currentTarget.value
                                                                    )
                                                            }
                                                        )
                                                    }
                                                >
                                                    <option value='latestItems'>
                                                        Neueste Einzelinhalte
                                                        (z. B. Folgen/Tracks)
                                                    </option>
                                                    <option value='latestTitles'>
                                                        Neueste Haupttitel
                                                        einmalig
                                                        (z. B. Serien/Alben)
                                                    </option>
                                                    <option value='latestSeasons'>
                                                        Neueste Staffeln nach
                                                        letzter neuer Folge
                                                        (eine Karte je Staffel)
                                                    </option>
                                                </select>
                                            </label>

                                            <label className='minitigerSettingsField'>
                                                <span>Anzeigeformat</span>
                                                <select
                                                    value={
                                                        row.sortMode === 'latestSeasons'
                                                            ? 'poster'
                                                            : row.display
                                                    }
                                                    disabled={
                                                        row.sortMode === 'latestSeasons'
                                                    }
                                                    onChange={event =>
                                                        onUpdateCustomRow(
                                                            row.key,
                                                            {
                                                                display:
                                                                    parseCustomDisplay(
                                                                        event.currentTarget.value
                                                                    )
                                                            }
                                                        )
                                                    }
                                                >
                                                    <option value='poster'>
                                                        Poster
                                                    </option>
                                                    <option value='landscape'>
                                                        Landscape
                                                    </option>
                                                </select>
                                            </label>

                                            <label className='minitigerSettingsField'>
                                                <span>Anzahl (3-50)</span>
                                                <input
                                                    type='number'
                                                    min='3'
                                                    max='50'
                                                    value={row.count}
                                                    onChange={event =>
                                                        onUpdateCustomRow(
                                                            row.key,
                                                            {
                                                                count:
                                                                    Number(
                                                                        event.currentTarget.value
                                                                    )
                                                            }
                                                        )
                                                    }
                                                />
                                            </label>
                                        </div>
                                    </details>
                                </div>
                            );
                        }

                        return null;
                    })}
                </div>
            </section>

            <section className='minitigerSettingsCard'>
                <div className='minitigerVirtualSettingsTitle'>
                    <div>
                        <h4>Virtuelle Bibliotheken</h4>
                        <p className='minitigerSettingsHint'>
                            Rein manuell gepflegt. Maximal 12 Bibliotheken,
                            vier Karten pro virtueller Reihe.
                        </p>
                    </div>

                    <button
                        type='button'
                        className='minitigerVirtualAddButton'
                        disabled={
                            virtualConfig.libraries.length >= 12
                        }
                        onClick={onAddVirtualLibrary}
                    >
                        + Virtuelle Bibliothek
                    </button>
                </div>

                <label className='minitigerRangeField'>
                    <span>
                        Größe der virtuellen Karten auf der Startseite
                    </span>
                    <div>
                        <input
                            type='range'
                            min='180'
                            max='520'
                            step='10'
                            value={virtualConfig.homeCardWidth}
                            onChange={event =>
                                onSetVirtualHomeCardWidth(
                                    Number(
                                        event.currentTarget.value
                                    )
                                )
                            }
                        />
                        <output>
                            {virtualConfig.homeCardWidth}
                        </output>
                    </div>
                </label>

                <p className='minitigerSettingsHint'>
                    Anders als in Phase 10 füllt eine einzelne virtuelle
                    Bibliothek jetzt nicht mehr automatisch ein Viertel
                    des kompletten Bildschirms.
                </p>

                <div className='minitigerVirtualLibraryEditorList'>
                    {orderedVirtualLibraries.map((
                        library,
                        index
                    ) => (
                        <div
                            key={library.id}
                            className='minitigerVirtualLibraryEditorCard'
                        >
                            <div className='minitigerVirtualLibraryEditorHead'>
                                <strong>
                                    {library.name}
                                </strong>

                                <div className='minitigerVirtualOrderButtons'>
                                    <button
                                        type='button'
                                        disabled={index === 0}
                                        onClick={() =>
                                            onMoveVirtualLibrary(
                                                library.id,
                                                -1
                                            )
                                        }
                                    >
                                        ↑
                                    </button>
                                    <button
                                        type='button'
                                        disabled={
                                            index
                                            === orderedVirtualLibraries.length - 1
                                        }
                                        onClick={() =>
                                            onMoveVirtualLibrary(
                                                library.id,
                                                1
                                            )
                                        }
                                    >
                                        ↓
                                    </button>
                                </div>
                            </div>

                            <label className='minitigerSettingsField'>
                                <span>Name</span>
                                <input
                                    type='text'
                                    value={library.name}
                                    onChange={event =>
                                        onUpdateVirtualLibrary(
                                            library.id,
                                            {
                                                name:
                                                    event.currentTarget.value
                                            }
                                        )
                                    }
                                />
                            </label>

                            <label className='minitigerSettingsField'>
                                <span>
                                    Inhalte darstellen
                                </span>
                                <select
                                    value={library.display}
                                    onChange={event =>
                                        onUpdateVirtualLibrary(
                                            library.id,
                                            {
                                                display:
                                                    event.currentTarget.value
                                                    === 'landscape'
                                                        ? 'landscape'
                                                        : 'poster'
                                            }
                                        )
                                    }
                                >
                                    <option value='poster'>
                                        Poster
                                    </option>
                                    <option value='landscape'>
                                        Landscape
                                    </option>
                                </select>
                            </label>

                            <label className='minitigerSettingsToggle'>
                                <input
                                    type='checkbox'
                                    checked={library.enabled}
                                    onChange={event =>
                                        onUpdateVirtualLibrary(
                                            library.id,
                                            {
                                                enabled:
                                                    event.currentTarget.checked
                                            }
                                        )
                                    }
                                />
                                <span>
                                    <strong>
                                        Auf der Startseite anzeigen
                                    </strong>
                                </span>
                            </label>

                            <label className='minitigerSettingsToggle'>
                                <input
                                    type='checkbox'
                                    checked={library.showCaption}
                                    onChange={event =>
                                        onUpdateVirtualLibrary(
                                            library.id,
                                            {
                                                showCaption:
                                                    event.currentTarget.checked
                                            }
                                        )
                                    }
                                />
                                <span>
                                    <strong>
                                        Name + Inhaltszahl unter der Karte
                                        anzeigen
                                    </strong>
                                </span>
                            </label>

                            <div className='minitigerVirtualImageEditor'>
                                {library.image ? (
                                    <img
                                        src={library.image}
                                        alt=''
                                    />
                                ) : (
                                    <div>Kein eigenes Bild</div>
                                )}

                                <div>
                                    <label className='minitigerVirtualFileButton'>
                                        Bild wählen
                                        <input
                                            type='file'
                                            accept='image/*'
                                            onChange={event => {
                                                const file =
                                                    event.currentTarget
                                                        .files?.[0];

                                                if (!file) {
                                                    return;
                                                }

                                                const reader =
                                                    new FileReader();

                                                reader.onload = () => {
                                                    if (
                                                        typeof reader.result
                                                        === 'string'
                                                    ) {
                                                        onUpdateVirtualLibrary(
                                                            library.id,
                                                            {
                                                                image:
                                                                    reader.result
                                                            }
                                                        );
                                                    }
                                                };

                                                reader.readAsDataURL(
                                                    file
                                                );
                                            }}
                                        />
                                    </label>

                                    {library.image && (
                                        <button
                                            type='button'
                                            onClick={() =>
                                                onUpdateVirtualLibrary(
                                                    library.id,
                                                    { image: '' }
                                                )
                                            }
                                        >
                                            Bild entfernen
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className='minitigerSettingsHint'>
                                {library.itemIds.length} Inhalte zugeordnet
                            </div>

                            <button
                                type='button'
                                className='minitigerVirtualRemoveButton'
                                onClick={() =>
                                    onRemoveVirtualLibrary(
                                        library.id
                                    )
                                }
                            >
                                Virtuelle Bibliothek entfernen
                            </button>
                        </div>
                    ))}
                </div>
            </section>
        </fieldset>
    );
};

export default MinitigerHomeBuilderSettings;

// MINITIGER_PATCH_MARKER: PHASE_18_18_0_LATEST_SEASONS_BUILDER
