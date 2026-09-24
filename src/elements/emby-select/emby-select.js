import layoutManager from '../../components/layoutManager';
import browser from '../../scripts/browser';
import actionsheet from '../../components/actionSheet/actionSheet';
import './emby-select.scss';
import 'webcomponents.js/webcomponents-lite';

const EmbySelectPrototype = Object.create(HTMLSelectElement.prototype);

function enableNativeMenu() {
    // Qt WebEngine's native <select> popup can paint multiple options as
    // selected in the Minitiger Desktop shell. Use Jellyfin's own action
    // sheet there instead of the platform-native popup.
    if (window.NativeShell) {
        return false;
    }

    // WebView 2 creates dropdown that doesn't work with controller.
    if (browser.edgeUwp || browser.xboxOne) {
        return false;
    }

    // Doesn't seem to work at all
    if (browser.tizen || browser.orsay || browser.web0s) {
        return false;
    }

    // Take advantage of the native input methods
    if (browser.tv) {
        return true;
    }

    return !layoutManager.tv;
}

function triggerChange(select, bubbles = false) {
    const evt = new Event('change', { bubbles, cancelable: true });
    select.dispatchEvent(evt);
}

function setValue(select, value) {
    select.value = value;
}

function showActionSheet(select, bubbleChange = false) {
    const labelElem = getLabel(select);
    const title = labelElem
        ? (labelElem.textContent || labelElem.innerText)
        : select.getAttribute('aria-label');

    actionsheet.show({
        items: select.options,
        positionTo: select,
        title: title

    }).then(function (value) {
        setValue(select, value);
        triggerChange(select, bubbleChange);
    });
}


let nativeShellDropdownCleanup = null;

function closeNativeShellDropdown() {
    if (nativeShellDropdownCleanup) {
        nativeShellDropdownCleanup();
        nativeShellDropdownCleanup = null;
    }
}

function showNativeShellDropdown(select, bubbleChange = false) {
    closeNativeShellDropdown();

    const menu = document.createElement('div');
    menu.className = 'minitigerNativeSelectMenu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute(
        'aria-label',
        select.getAttribute('aria-label')
            || getLabel(select)?.textContent
            || 'Auswahl'
    );

    const options = Array.from(select.options);

    options.forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'minitigerNativeSelectOption';
        button.setAttribute('role', 'option');
        button.setAttribute(
            'aria-selected',
            option.selected ? 'true' : 'false'
        );
        button.disabled = option.disabled;
        button.textContent = option.textContent || option.label || option.value;

        if (option.selected) {
            button.classList.add('isSelected');
        }

        button.addEventListener('click', () => {
            if (option.disabled) {
                return;
            }

            setValue(select, option.value);
            closeNativeShellDropdown();
            triggerChange(select, bubbleChange);
            select.focus();
        });

        menu.appendChild(button);
    });

    document.body.appendChild(menu);
    select.setAttribute('aria-expanded', 'true');

    const position = () => {
        const rect = select.getBoundingClientRect();
        const viewportPadding = 8;
        const minWidth = Math.max(220, rect.width);
        const maxWidth = Math.max(
            minWidth,
            Math.min(520, window.innerWidth - viewportPadding * 2)
        );

        menu.style.minWidth = minWidth + 'px';
        menu.style.maxWidth = maxWidth + 'px';

        const availableBelow =
            window.innerHeight - rect.bottom - viewportPadding;
        const availableAbove =
            rect.top - viewportPadding;
        const useAbove =
            availableBelow < 180
            && availableAbove > availableBelow;

        menu.style.maxHeight =
            Math.max(
                140,
                Math.min(
                    420,
                    useAbove ? availableAbove : availableBelow
                )
            ) + 'px';

        const menuRect = menu.getBoundingClientRect();
        let left = rect.left;

        if (left + menuRect.width > window.innerWidth - viewportPadding) {
            left =
                window.innerWidth
                - viewportPadding
                - menuRect.width;
        }

        left = Math.max(viewportPadding, left);

        let top = useAbove
            ? rect.top - menuRect.height - 4
            : rect.bottom + 4;

        top = Math.max(
            viewportPadding,
            Math.min(
                top,
                window.innerHeight
                - viewportPadding
                - menuRect.height
            )
        );

        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    };

    position();

    const selectedButton =
        menu.querySelector('.minitigerNativeSelectOption.isSelected');

    selectedButton?.scrollIntoView({
        block: 'nearest'
    });

    const onDocumentMouseDown = event => {
        if (
            event.target instanceof Node
            && (
                menu.contains(event.target)
                || select.contains(event.target)
            )
        ) {
            return;
        }

        closeNativeShellDropdown();
    };

    const onKeyDown = event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeNativeShellDropdown();
            select.focus();
        }
    };

    const onViewportChange = () => {
        closeNativeShellDropdown();
    };

    window.setTimeout(() => {
        document.addEventListener(
            'mousedown',
            onDocumentMouseDown,
            true
        );
    }, 0);
    document.addEventListener(
        'keydown',
        onKeyDown,
        true
    );
    window.addEventListener(
        'resize',
        onViewportChange,
        { passive: true }
    );
    window.addEventListener(
        'scroll',
        onViewportChange,
        true
    );

    nativeShellDropdownCleanup = () => {
        document.removeEventListener(
            'mousedown',
            onDocumentMouseDown,
            true
        );
        document.removeEventListener(
            'keydown',
            onKeyDown,
            true
        );
        window.removeEventListener(
            'resize',
            onViewportChange
        );
        window.removeEventListener(
            'scroll',
            onViewportChange,
            true
        );
        select.removeAttribute('aria-expanded');
        menu.remove();
    };
}

function getLabel(select) {
    let elem = select.previousSibling;
    while (elem && elem.tagName !== 'LABEL') {
        elem = elem.previousSibling;
    }
    return elem;
}

function onFocus() {
    const label = getLabel(this);
    if (label) {
        label.classList.add('selectLabelFocused');
    }
}

function onBlur() {
    const label = getLabel(this);
    if (label) {
        label.classList.remove('selectLabelFocused');
    }
}

function onMouseDown(e) {
    // e.button=0 for primary (left) mouse button click
    if (!e.button && !enableNativeMenu()) {
        e.preventDefault();
        showActionSheet(this);
    }
}

function onKeyDown(e) {
    // Xbox controller for UWP WebView2 uses keycode 195 to select.
    if ((e.keyCode === 13 || e.keyCode === 195) && !enableNativeMenu()) {
        e.preventDefault();
        showActionSheet(this);
    }
}

function getSelectFromEventTarget(target) {
    if (target instanceof HTMLSelectElement) {
        return target;
    }

    if (target instanceof Element) {
        return target.closest('select');
    }

    return null;
}

/*
 * Minitiger Desktop / Qt WebEngine:
 * Native select popups can render many unrelated options with the Windows
 * selection highlight. Intercept every real <select> in NativeShell and use
 * Jellyfin's own action sheet instead. This also covers plain React selects
 * and the Desktop client settings modal, which only apply emby-select classes
 * without using the customized built-in element.
 */
function onNativeShellSelectMouseDown(e) {
    if (!window.NativeShell || e.button !== 0) {
        return;
    }

    const select = getSelectFromEventTarget(e.target);
    if (
        !select
        || select.disabled
        || select.multiple
        || select.size > 1
    ) {
        return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();
    showNativeShellDropdown(select, true);
}

function onNativeShellSelectKeyDown(e) {
    if (
        !window.NativeShell
        || (e.key !== 'Enter' && e.key !== ' ' && e.keyCode !== 195)
    ) {
        return;
    }

    const select = getSelectFromEventTarget(e.target);
    if (
        !select
        || select.disabled
        || select.multiple
        || select.size > 1
    ) {
        return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();
    showNativeShellDropdown(select, true);
}

document.addEventListener('mousedown', onNativeShellSelectMouseDown, true);
document.addEventListener('keydown', onNativeShellSelectKeyDown, true);

let inputId = 0;

EmbySelectPrototype.createdCallback = function () {
    if (!this.id) {
        this.id = 'embyselect' + inputId;
        inputId++;
    }

    this.classList.add('emby-select-withcolor');

    if (layoutManager.tv) {
        this.classList.add('emby-select-focusscale');
    }

    this.addEventListener('mousedown', onMouseDown);
    this.addEventListener('keydown', onKeyDown);

    this.addEventListener('focus', onFocus);
    this.addEventListener('blur', onBlur);
};

EmbySelectPrototype.attachedCallback = function () {
    if (this.classList.contains('emby-select')) {
        return;
    }

    this.classList.add('emby-select');

    const label = this.ownerDocument.createElement('label');
    label.innerText = this.getAttribute('label') || '';
    label.classList.add('selectLabel');
    label.htmlFor = this.id;
    this.parentNode?.insertBefore(label, this);

    if (this.classList.contains('emby-select-withcolor')) {
        this.parentNode?.insertAdjacentHTML('beforeend', '<div class="selectArrowContainer"><div style="visibility:hidden;display:none;">0</div><span class="selectArrow material-icons keyboard_arrow_down" aria-hidden="true"></span></div>');
    }
};

EmbySelectPrototype.setLabel = function (text) {
    const label = this.parentNode?.querySelector('label');

    label.innerText = text;
};

document.registerElement('emby-select', {
    prototype: EmbySelectPrototype,
    extends: 'select'
});

