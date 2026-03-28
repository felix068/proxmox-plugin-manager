(function() {
    'use strict';
    console.log('[PasteText] Loading...');

    // Table de mapping caractère -> {code, shift, altGr}
    // code = KeyCode physique (pour scancodes)
    // shift = true si Shift requis
    // altGr = true si AltGr requis (Ctrl+Alt sur certains systèmes)

    // Mapping pour clavier AZERTY français (caractère -> touche physique à presser)
    const AZERTY_MAP = {
        // Lettres minuscules - position AZERTY
        'a': {code: 'KeyQ', shift: false},
        'b': {code: 'KeyB', shift: false},
        'c': {code: 'KeyC', shift: false},
        'd': {code: 'KeyD', shift: false},
        'e': {code: 'KeyE', shift: false},
        'f': {code: 'KeyF', shift: false},
        'g': {code: 'KeyG', shift: false},
        'h': {code: 'KeyH', shift: false},
        'i': {code: 'KeyI', shift: false},
        'j': {code: 'KeyJ', shift: false},
        'k': {code: 'KeyK', shift: false},
        'l': {code: 'KeyL', shift: false},
        'm': {code: 'Semicolon', shift: false},
        'n': {code: 'KeyN', shift: false},
        'o': {code: 'KeyO', shift: false},
        'p': {code: 'KeyP', shift: false},
        'q': {code: 'KeyA', shift: false},
        'r': {code: 'KeyR', shift: false},
        's': {code: 'KeyS', shift: false},
        't': {code: 'KeyT', shift: false},
        'u': {code: 'KeyU', shift: false},
        'v': {code: 'KeyV', shift: false},
        'w': {code: 'KeyZ', shift: false},
        'x': {code: 'KeyX', shift: false},
        'y': {code: 'KeyY', shift: false},
        'z': {code: 'KeyW', shift: false},

        // Lettres majuscules
        'A': {code: 'KeyQ', shift: true},
        'B': {code: 'KeyB', shift: true},
        'C': {code: 'KeyC', shift: true},
        'D': {code: 'KeyD', shift: true},
        'E': {code: 'KeyE', shift: true},
        'F': {code: 'KeyF', shift: true},
        'G': {code: 'KeyG', shift: true},
        'H': {code: 'KeyH', shift: true},
        'I': {code: 'KeyI', shift: true},
        'J': {code: 'KeyJ', shift: true},
        'K': {code: 'KeyK', shift: true},
        'L': {code: 'KeyL', shift: true},
        'M': {code: 'Semicolon', shift: true},
        'N': {code: 'KeyN', shift: true},
        'O': {code: 'KeyO', shift: true},
        'P': {code: 'KeyP', shift: true},
        'Q': {code: 'KeyA', shift: true},
        'R': {code: 'KeyR', shift: true},
        'S': {code: 'KeyS', shift: true},
        'T': {code: 'KeyT', shift: true},
        'U': {code: 'KeyU', shift: true},
        'V': {code: 'KeyV', shift: true},
        'W': {code: 'KeyZ', shift: true},
        'X': {code: 'KeyX', shift: true},
        'Y': {code: 'KeyY', shift: true},
        'Z': {code: 'KeyW', shift: true},

        // Chiffres (rangée du haut avec Shift sur AZERTY)
        '1': {code: 'Digit1', shift: true},
        '2': {code: 'Digit2', shift: true},
        '3': {code: 'Digit3', shift: true},
        '4': {code: 'Digit4', shift: true},
        '5': {code: 'Digit5', shift: true},
        '6': {code: 'Digit6', shift: true},
        '7': {code: 'Digit7', shift: true},
        '8': {code: 'Digit8', shift: true},
        '9': {code: 'Digit9', shift: true},
        '0': {code: 'Digit0', shift: true},

        // Symboles AZERTY (sans Shift)
        '&': {code: 'Digit1', shift: false},
        'é': {code: 'Digit2', shift: false},
        '"': {code: 'Digit3', shift: false},
        "'": {code: 'Digit4', shift: false},
        '(': {code: 'Digit5', shift: false},
        '-': {code: 'Digit6', shift: false},
        'è': {code: 'Digit7', shift: false},
        '_': {code: 'Digit8', shift: false},
        'ç': {code: 'Digit9', shift: false},
        'à': {code: 'Digit0', shift: false},
        ')': {code: 'Minus', shift: false},
        '=': {code: 'Equal', shift: false},

        // Ponctuation
        ',': {code: 'KeyM', shift: false},
        ';': {code: 'Comma', shift: false},
        ':': {code: 'Period', shift: false},
        '!': {code: 'Slash', shift: false},
        '?': {code: 'Semicolon', shift: true},  // M majuscule = ?... non, c'est Shift+Comma
        '.': {code: 'Comma', shift: true},
        '/': {code: 'Period', shift: true},
        '§': {code: 'Slash', shift: true},

        // Caractères spéciaux avec position
        '*': {code: 'Backslash', shift: false},
        'µ': {code: 'Backslash', shift: true},
        'ù': {code: 'Quote', shift: false},
        '%': {code: 'Quote', shift: true},
        '$': {code: 'BracketRight', shift: false},
        '£': {code: 'BracketRight', shift: true},
        '<': {code: 'IntlBackslash', shift: false},
        '>': {code: 'IntlBackslash', shift: true},

        // Caractères AltGr (AZERTY français - positions réelles)
        '~': {code: 'Digit2', shift: false, altGr: true},
        '#': {code: 'Digit3', shift: false, altGr: true},
        '{': {code: 'Digit4', shift: false, altGr: true},
        '[': {code: 'Digit5', shift: false, altGr: true},
        '|': {code: 'Digit6', shift: false, altGr: true},
        '`': {code: 'Digit7', shift: false, altGr: true},
        '\\': {code: 'Digit8', shift: false, altGr: true},
        '^': {code: 'Digit9', shift: false, altGr: true},
        '@': {code: 'Digit0', shift: false, altGr: true},
        ']': {code: 'Minus', shift: false, altGr: true},
        '}': {code: 'Equal', shift: false, altGr: true},
        '€': {code: 'KeyE', shift: false, altGr: true},


        // Espace et contrôle
        ' ': {code: 'Space', shift: false},
        '\t': {code: 'Tab', shift: false},
        '\n': {code: 'Enter', shift: false},
        '\r': {code: 'Enter', shift: false},
    };

    // Mapping pour clavier QWERTY (caractère -> touche physique à presser)
    const QWERTY_MAP = {
        // Lettres minuscules - position QWERTY standard
        'a': {code: 'KeyA', shift: false},
        'b': {code: 'KeyB', shift: false},
        'c': {code: 'KeyC', shift: false},
        'd': {code: 'KeyD', shift: false},
        'e': {code: 'KeyE', shift: false},
        'f': {code: 'KeyF', shift: false},
        'g': {code: 'KeyG', shift: false},
        'h': {code: 'KeyH', shift: false},
        'i': {code: 'KeyI', shift: false},
        'j': {code: 'KeyJ', shift: false},
        'k': {code: 'KeyK', shift: false},
        'l': {code: 'KeyL', shift: false},
        'm': {code: 'KeyM', shift: false},
        'n': {code: 'KeyN', shift: false},
        'o': {code: 'KeyO', shift: false},
        'p': {code: 'KeyP', shift: false},
        'q': {code: 'KeyQ', shift: false},
        'r': {code: 'KeyR', shift: false},
        's': {code: 'KeyS', shift: false},
        't': {code: 'KeyT', shift: false},
        'u': {code: 'KeyU', shift: false},
        'v': {code: 'KeyV', shift: false},
        'w': {code: 'KeyW', shift: false},
        'x': {code: 'KeyX', shift: false},
        'y': {code: 'KeyY', shift: false},
        'z': {code: 'KeyZ', shift: false},

        // Lettres majuscules
        'A': {code: 'KeyA', shift: true},
        'B': {code: 'KeyB', shift: true},
        'C': {code: 'KeyC', shift: true},
        'D': {code: 'KeyD', shift: true},
        'E': {code: 'KeyE', shift: true},
        'F': {code: 'KeyF', shift: true},
        'G': {code: 'KeyG', shift: true},
        'H': {code: 'KeyH', shift: true},
        'I': {code: 'KeyI', shift: true},
        'J': {code: 'KeyJ', shift: true},
        'K': {code: 'KeyK', shift: true},
        'L': {code: 'KeyL', shift: true},
        'M': {code: 'KeyM', shift: true},
        'N': {code: 'KeyN', shift: true},
        'O': {code: 'KeyO', shift: true},
        'P': {code: 'KeyP', shift: true},
        'Q': {code: 'KeyQ', shift: true},
        'R': {code: 'KeyR', shift: true},
        'S': {code: 'KeyS', shift: true},
        'T': {code: 'KeyT', shift: true},
        'U': {code: 'KeyU', shift: true},
        'V': {code: 'KeyV', shift: true},
        'W': {code: 'KeyW', shift: true},
        'X': {code: 'KeyX', shift: true},
        'Y': {code: 'KeyY', shift: true},
        'Z': {code: 'KeyZ', shift: true},

        // Chiffres (sans Shift sur QWERTY)
        '1': {code: 'Digit1', shift: false},
        '2': {code: 'Digit2', shift: false},
        '3': {code: 'Digit3', shift: false},
        '4': {code: 'Digit4', shift: false},
        '5': {code: 'Digit5', shift: false},
        '6': {code: 'Digit6', shift: false},
        '7': {code: 'Digit7', shift: false},
        '8': {code: 'Digit8', shift: false},
        '9': {code: 'Digit9', shift: false},
        '0': {code: 'Digit0', shift: false},

        // Symboles avec Shift sur QWERTY
        '!': {code: 'Digit1', shift: true},
        '@': {code: 'Digit2', shift: true},
        '#': {code: 'Digit3', shift: true},
        '$': {code: 'Digit4', shift: true},
        '%': {code: 'Digit5', shift: true},
        '^': {code: 'Digit6', shift: true},
        '&': {code: 'Digit7', shift: true},
        '*': {code: 'Digit8', shift: true},
        '(': {code: 'Digit9', shift: true},
        ')': {code: 'Digit0', shift: true},

        // Ponctuation
        '-': {code: 'Minus', shift: false},
        '_': {code: 'Minus', shift: true},
        '=': {code: 'Equal', shift: false},
        '+': {code: 'Equal', shift: true},
        '[': {code: 'BracketLeft', shift: false},
        '{': {code: 'BracketLeft', shift: true},
        ']': {code: 'BracketRight', shift: false},
        '}': {code: 'BracketRight', shift: true},
        '\\': {code: 'Backslash', shift: false},
        '|': {code: 'Backslash', shift: true},
        ';': {code: 'Semicolon', shift: false},
        ':': {code: 'Semicolon', shift: true},
        "'": {code: 'Quote', shift: false},
        '"': {code: 'Quote', shift: true},
        ',': {code: 'Comma', shift: false},
        '<': {code: 'Comma', shift: true},
        '.': {code: 'Period', shift: false},
        '>': {code: 'Period', shift: true},
        '/': {code: 'Slash', shift: false},
        '?': {code: 'Slash', shift: true},
        '`': {code: 'Backquote', shift: false},
        '~': {code: 'Backquote', shift: true},

        // Espace et contrôle
        ' ': {code: 'Space', shift: false},
        '\t': {code: 'Tab', shift: false},
        '\n': {code: 'Enter', shift: false},
        '\r': {code: 'Enter', shift: false},
    };

    function init() {
        const pasteBtn = document.getElementById('pve_paste_btn');
        const pastePanel = document.getElementById('pve_paste_panel');
        const typeBtn = document.getElementById('pve_type_btn');
        const textarea = document.getElementById('pve_text');
        const delay = document.getElementById('pve_delay');
        const layout = document.getElementById('pve_layout');
        const status = document.getElementById('pve_status');

        if (!pasteBtn || !pastePanel || !typeBtn) {
            console.error('[PasteText] Elements not found');
            return;
        }

        console.log('[PasteText] Attaching handlers...');

        function closePastePanel() {
            pastePanel.classList.remove('noVNC_open');
            pasteBtn.classList.remove('noVNC_selected');
        }

        function isOtherNoVNCButton(target) {
            const button = target && target.closest ? target.closest('.noVNC_button') : null;
            return button && button !== pasteBtn;
        }

        // Toggle panel
        pasteBtn.addEventListener('click', () => {
            if (pastePanel.classList.contains('noVNC_open')) {
                closePastePanel();
            } else {
                document.querySelectorAll('.noVNC_panel').forEach(p => p.classList.remove('noVNC_open'));
                document.querySelectorAll('.noVNC_button').forEach(b => b.classList.remove('noVNC_selected'));
                pastePanel.classList.add('noVNC_open');
                pasteBtn.classList.add('noVNC_selected');
            }
        });

        const controlBarHandle = document.getElementById('noVNC_control_bar_handle');
        if (controlBarHandle) {
            controlBarHandle.addEventListener('click', closePastePanel);
        }

        document.addEventListener('click', (event) => {
            if (!pastePanel.classList.contains('noVNC_open')) {
                return;
            }

            if (event.target === pasteBtn || pasteBtn.contains(event.target)) {
                return;
            }

            if (event.target === controlBarHandle || (controlBarHandle && controlBarHandle.contains(event.target))) {
                return;
            }

            if (isOtherNoVNCButton(event.target)) {
                closePastePanel();
            }
        }, true);

        // Helper: envoyer une touche avec code physique (scancode)
        function sendKey(keysym, code, down) {
            if (!window.UI || !window.UI.rfb) {
                return false;
            }
            window.UI.rfb.sendKey(keysym, code, down);
            return true;
        }

        // Helper: sleep
        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        // Keysyms pour les modificateurs
        const SHIFT_KEYSYM = 0xFFE1;    // Shift_L
        const CTRL_KEYSYM = 0xFFE3;     // Control_L
        const ALT_KEYSYM = 0xFFE9;      // Alt_L
        const ALTGR_KEYSYM = 0xFE03;    // ISO_Level3_Shift (AltGr)

        // Type text character by character using scancodes
        // Délai mini entre les actions de touches (comme un humain)
        const KEY_DELAY = 15;  // ms entre chaque action normale
        const ALTGR_DELAY = 30;  // ms pour les touches AltGr (plus lent)

        async function typeText(text, delayMs, useAzerty) {
            const keyMap = useAzerty ? AZERTY_MAP : QWERTY_MAP;
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                const mapping = keyMap[char];

                if (mapping) {
                    // Cas spécial: keysymOnly - envoyer directement le keysym sans scancode
                    if (mapping.keysymOnly) {
                        const keysym = char.charCodeAt(0);
                        sendKey(keysym, null, true);
                        await sleep(KEY_DELAY);
                        sendKey(keysym, null, false);
                    } else {
                        // Utiliser le mapping avec scancodes
                        const code = mapping.code;
                        const needShift = mapping.shift || false;
                        const needAltGr = mapping.altGr || false;

                        // Calculer le keysym pour ce caractère
                        let keysym = char.charCodeAt(0);
                        if (char === '\n' || char === '\r') keysym = 0xFF0D;
                        else if (char === '\t') keysym = 0xFF09;
                        else if (char === ' ') keysym = 0x20;

                        // Séquence optimisée pour caractères spéciaux
                        if (needAltGr) {
                            // 1. Appuyer AltGr
                            sendKey(ALTGR_KEYSYM, 'AltRight', true);
                            await sleep(ALTGR_DELAY);

                            // 2. Appuyer la touche
                            sendKey(keysym, code, true);
                            await sleep(ALTGR_DELAY);

                            // 3. Relâcher la touche
                            sendKey(keysym, code, false);
                            await sleep(ALTGR_DELAY);

                            // 4. Relâcher AltGr
                            sendKey(ALTGR_KEYSYM, 'AltRight', false);
                            await sleep(ALTGR_DELAY);
                        } else if (needShift) {
                            // 1. Appuyer Shift
                            sendKey(SHIFT_KEYSYM, 'ShiftLeft', true);
                            await sleep(KEY_DELAY);

                            // 2. Appuyer la touche
                            sendKey(keysym, code, true);
                            await sleep(KEY_DELAY);

                            // 3. Relâcher la touche
                            sendKey(keysym, code, false);
                            await sleep(KEY_DELAY);

                            // 4. Relâcher Shift
                            sendKey(SHIFT_KEYSYM, 'ShiftLeft', false);
                            await sleep(KEY_DELAY);
                        } else {
                            // Touche simple sans modificateur
                            sendKey(keysym, code, true);
                            await sleep(KEY_DELAY);
                            sendKey(keysym, code, false);
                            await sleep(KEY_DELAY);
                        }

                    }
                } else {
                    // Caractère non mappé - envoyer juste le keysym
                    const charCode = char.charCodeAt(0);
                    let keysym;
                    if (charCode >= 0x20 && charCode <= 0xFF) {
                        keysym = charCode;
                    } else {
                        keysym = 0x01000000 + charCode; // Unicode
                    }
                    sendKey(keysym, null, true);
                    await sleep(KEY_DELAY);
                    sendKey(keysym, null, false);
                }

                // Délai entre chaque caractère
                if (delayMs > 0) {
                    await sleep(delayMs);
                }
            }
        }

        // Type text button
        typeBtn.addEventListener('click', async () => {
            const text = textarea.value;
            const d = parseInt(delay.value) || 50;
            const useAzerty = layout && layout.value === 'azerty';

            if (!text) {
                showStatus('Enter text', 'error');
                return;
            }

            if (!window.UI || !window.UI.rfb) {
                showStatus('Not connected', 'error');
                return;
            }

            try {
                showStatus('Typing ' + text.length + ' chars...', 'progress');
                typeBtn.disabled = true;
                await typeText(text, d, useAzerty);
                showStatus('Done!', 'success');
                typeBtn.disabled = false;
                setTimeout(() => status.style.display = 'none', 3000);
            } catch (error) {
                console.error('[PasteText] Error:', error);
                showStatus(error.message, 'error');
                typeBtn.disabled = false;
            }
        });

        function showStatus(msg, type) {
            status.style.display = 'block';
            status.textContent = msg;
            if (type === 'error') {
                status.style.background = '#501616';
                status.style.color = '#ff9f9f';
            } else if (type === 'success') {
                status.style.background = '#2d5016';
                status.style.color = '#9fff9f';
            } else {
                status.style.background = '#505016';
                status.style.color = '#ffff9f';
            }
        }

        console.log('[PasteText] Ready!');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
