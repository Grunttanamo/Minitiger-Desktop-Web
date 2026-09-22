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
    showActionSheet(select, true);
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
    showActionSheet(select, true);
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

