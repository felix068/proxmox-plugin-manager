(function() {
  'use strict';

  let termInstance = null;

  function patchTerminal() {
    if (typeof Terminal === 'undefined') {
      return setTimeout(patchTerminal, 50);
    }

    if (window.__pveXtermClipboardPatched) {
      return;
    }
    window.__pveXtermClipboardPatched = true;

    const OriginalTerminal = Terminal;
    window.Terminal = function(...args) {
      termInstance = new OriginalTerminal(...args);
      return termInstance;
    };
    window.Terminal.prototype = OriginalTerminal.prototype;
    Object.setPrototypeOf(window.Terminal, OriginalTerminal);

    for (const key of Object.getOwnPropertyNames(OriginalTerminal)) {
      if (['prototype', 'length', 'name'].includes(key)) {
        continue;
      }
      try {
        window.Terminal[key] = OriginalTerminal[key];
      } catch (_error) {}
    }
  }

  function getTerm() {
    if (termInstance) {
      return termInstance;
    }
    if (window.term) {
      return window.term;
    }
    const element = document.querySelector('.xterm');
    return element?._terminal || element?.terminal || null;
  }

  function writeToTerminal(text) {
    const term = getTerm();
    if (!term || !text) {
      return false;
    }

    if (typeof term.paste === 'function') {
      term.paste(text);
      return true;
    }
    if (typeof term.write === 'function') {
      term.write(text);
      return true;
    }
    return false;
  }

  function focusPasteTarget() {
    const helper = document.querySelector('.xterm-helper-textarea');
    if (helper && typeof helper.focus === 'function') {
      helper.focus();
      return;
    }

    const term = getTerm();
    if (term && term.textarea && typeof term.textarea.focus === 'function') {
      term.textarea.focus();
    }
  }

  function copySelection() {
    const term = getTerm();
    const selection = term?.getSelection?.() || term?.getSelectionText?.() || window.getSelection().toString();
    if (!selection) {
      return;
    }
    navigator.clipboard.writeText(selection).catch(function(error) {
      console.warn('[xterm-clipboard] Copy failed:', error);
    });
  }

  function init() {
    document.addEventListener('keydown', function(event) {
      if (!event.ctrlKey || !event.shiftKey) {
        return;
      }

      const key = String(event.key || '').toLowerCase();
      if (key === 'c' || event.keyCode === 67) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        copySelection();
        return false;
      }

      if (key === 'v' || event.keyCode === 86) {
        focusPasteTarget();
      }
    }, true);

    document.addEventListener('paste', function(event) {
      const text = event.clipboardData?.getData('text/plain');
      if (!text) {
        return;
      }

      if (writeToTerminal(text)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  patchTerminal();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
