import browser from '../../scripts/browser';
import dom from '../../utils/dom';
import './emby-checkbox.scss';
import 'webcomponents.js/webcomponents-lite';

const EmbyCheckboxPrototype = Object.create(HTMLInputElement.prototype);

function onKeyDown(e) {
    // Don't submit form on enter
    // Real (non-emulator) Tizen does nothing on Space
    if (e.keyCode === 13 || (e.keyCode === 32 && browser.tizen)) {
        e.preventDefault();

        this.checked = !this.checked;

        this.dispatchEvent(new CustomEvent('change', {
            bubbles: true
        }));

        return false;
    }
}

const enableRefreshHack = browser.tizen || browser.orsay || browser.operaTv || browser.web0s;

function forceRefresh(loading) {
    const elem = this.parentNode;

    elem.style.webkitAnimationName = 'repaintChrome';
    elem.style.webkitAnimationDelay = (loading === true ? '500ms' : '');
    elem.style.webkitAnimationDuration = '10ms';
    elem.style.webkitAnimationIterationCount = '1';

    setTimeout(function () {
        elem.style.webkitAnimationName = '';
    }, (loading === true ? 520 : 20));
}


function syncCheckedVisual() {
    const labelElement = this.parentNode;
    const outline =
        labelElement?.querySelector('.checkboxOutline');

    if (!outline) {
        return;
    }

    outline.classList.toggle(
        'minitigerChecked',
        Boolean(this.checked)
    );
}

EmbyCheckboxPrototype.attachedCallback = function () {
    if (this.getAttribute('data-embycheckbox') === 'true') {
        return;
    }

    this.setAttribute('data-embycheckbox', 'true');

    this.classList.add('emby-checkbox');

    const labelElement = this.parentNode;
    labelElement.classList.add('emby-checkbox-label');

    const labelTextElement = labelElement.querySelector('span');

    let outlineClass = 'checkboxOutline';

    const customClass = this.getAttribute('data-outlineclass');
    if (customClass) {
        outlineClass += ' ' + customClass;
    }

    const checkedIcon = this.getAttribute('data-checkedicon') || 'check';
    const uncheckedIcon = this.getAttribute('data-uncheckedicon') || '';
    const checkHtml = '<span class="material-icons checkboxIcon checkboxIcon-checked ' + checkedIcon + '" aria-hidden="true"></span>';
    const uncheckedHtml = '<span class="material-icons checkboxIcon checkboxIcon-unchecked ' + uncheckedIcon + '" aria-hidden="true"></span>';
    labelElement.insertAdjacentHTML('beforeend', '<span class="' + outlineClass + '">' + checkHtml + uncheckedHtml + '</span>');

    labelTextElement.classList.add('checkboxLabel');

    this.addEventListener('keydown', onKeyDown);
    this.addEventListener('change', syncCheckedVisual);
    this.addEventListener('click', syncCheckedVisual);

    // Qt WebEngine occasionally fails to repaint CSS :checked selectors in
    // legacy Jellyfin dialogs. Mirror the real input.checked property into a
    // class on the generated outline instead.
    syncCheckedVisual.call(this);
    requestAnimationFrame(() => {
        syncCheckedVisual.call(this);
    });
    setTimeout(() => {
        syncCheckedVisual.call(this);
    }, 0);

    if (enableRefreshHack) {
        forceRefresh.call(this, true);
        dom.addEventListener(this, 'click', forceRefresh, {
            passive: true
        });
        dom.addEventListener(this, 'blur', forceRefresh, {
            passive: true
        });
        dom.addEventListener(this, 'focus', forceRefresh, {
            passive: true
        });
        dom.addEventListener(this, 'change', forceRefresh, {
            passive: true
        });
    }
};

EmbyCheckboxPrototype.detachedCallback = function () {
    this.removeEventListener('keydown', onKeyDown);
    this.removeEventListener('change', syncCheckedVisual);
    this.removeEventListener('click', syncCheckedVisual);

    dom.removeEventListener(this, 'click', forceRefresh, {
        passive: true
    });
    dom.removeEventListener(this, 'blur', forceRefresh, {
        passive: true
    });
    dom.removeEventListener(this, 'focus', forceRefresh, {
        passive: true
    });
    dom.removeEventListener(this, 'change', forceRefresh, {
        passive: true
    });
};

document.registerElement('emby-checkbox', {
    prototype: EmbyCheckboxPrototype,
    extends: 'input'
});

