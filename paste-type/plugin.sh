#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="/usr/share/novnc-pve/index.html.tpl"
APP_JS="/usr/share/novnc-pve/app.js"
APP_DIR="/usr/share/novnc-pve/app"
IMAGE_DIR="$APP_DIR/images"
JS_FILE="paste-text-injector.js"
UI_FILE="ui-exporter.js"
SVG_FILE="clipboard.svg"
JS_DEST="$APP_DIR/$JS_FILE"
UI_DEST="$APP_DIR/$UI_FILE"
SVG_DEST="$IMAGE_DIR/$SVG_FILE"
BLOCK_START="<!-- PVE_PASTE_TYPE_START -->"
BLOCK_END="<!-- PVE_PASTE_TYPE_END -->"
SCRIPT_MARKER="<!-- PVE_PASTE_TYPE_SCRIPT -->"
PM_PLUGIN_NAME="paste-type"
PM_BACKUP_ROOT="$(dirname "$TEMPLATE")/plugin-backups"
. "$SCRIPT_DIR/../plugin-backup.sh"

status() {
    [ -f "$JS_DEST" ] || return 1
    [ -f "$UI_DEST" ] || return 1
    [ -f "$SVG_DEST" ] || return 1
    grep -q "$BLOCK_START" "$TEMPLATE" || return 1
    grep -q "$SCRIPT_MARKER" "$TEMPLATE" || return 1
    grep -q 'pve_paste_btn' "$TEMPLATE" || return 1
    ! grep -q 'noVNC_clipboard_button' "$APP_JS" || return 1
}

install() {
    mkdir -p "$IMAGE_DIR"
    cp "$SCRIPT_DIR/$JS_FILE" "$JS_DEST"
    cp "$SCRIPT_DIR/$UI_FILE" "$UI_DEST"
    cp "$SCRIPT_DIR/$SVG_FILE" "$SVG_DEST"
    chmod 644 "$JS_DEST" "$UI_DEST" "$SVG_DEST"

    pm_backup_file "$TEMPLATE"
    pm_backup_file "$APP_JS"

    grep -q "window.UI = UI;" "$TEMPLATE" || sed -i '0,/UI.start({/s//window.UI = UI; UI.start({/' "$TEMPLATE"

    python3 <<'PY'
from pathlib import Path
import re

template = Path('/usr/share/novnc-pve/index.html.tpl')
text = template.read_text()
app_js = Path('/usr/share/novnc-pve/app.js')
app_text = app_js.read_text()
BLOCK_START = '<!-- PVE_PASTE_TYPE_START -->'
BLOCK_END = '<!-- PVE_PASTE_TYPE_END -->'
SCRIPT_MARKER = '<!-- PVE_PASTE_TYPE_SCRIPT -->'
clipboard_block = """            <!-- Clipboard -->
            <input type="image" alt="Clipboard" src="/novnc/app/images/clipboard.svg"
                id="noVNC_clipboard_button" class="noVNC_button" title="Clipboard" style="display:none">
            <div class="noVNC_vcenter" style="display:none">
            <div id="noVNC_clipboard" class="noVNC_panel">
                <div class="noVNC_heading">
                    <img alt="" src="/novnc/app/images/clipboard.svg"> Clipboard
                </div>
                <p class="noVNC_subheading">
                    Edit clipboard content in the textarea below.
                </p>
                <textarea id="noVNC_clipboard_text" rows=5></textarea>
            </div>
            </div>"""

clipboard_methods = """  closeClipboardPanel() {
    const panel = document.getElementById("noVNC_clipboard");
    if (panel) {
      panel.classList.remove("noVNC_open");
    }
  },
  openClipboardPanel() {
    const panel = document.getElementById("noVNC_clipboard");
    if (panel) {
      panel.classList.add("noVNC_open");
    }
  },
  toggleClipboardPanel() {
    const panel = document.getElementById("noVNC_clipboard");
    if (!panel) {
      return;
    }
    if (panel.classList.contains("noVNC_open")) {
      UI.closeClipboardPanel();
    } else {
      UI.openClipboardPanel();
    }
  },
  clipboardReceive(e2) {
    const field = document.getElementById("noVNC_clipboard_text");
    if (field && e2 && e2.detail) {
      field.value = e2.detail.text;
    }
  },
  clipboardSend() {
    const field = document.getElementById("noVNC_clipboard_text");
    if (field && UI.rfb) {
      UI.rfb.clipboardPasteFrom(field.value);
    }
  },
"""

text = text.replace('/novnc/app.js?ver=1.6.0-3', '/novnc/app.js?ver=1.6.0-3&paste-type=2')

block = """<!-- PVE_PASTE_TYPE_START -->
            <input type="image" alt="Paste&Type" src="/novnc/app/images/clipboard.svg"
                id="pve_paste_btn" class="noVNC_button" title="Paste and Type Text">
            <div class="noVNC_vcenter"><div id="pve_paste_panel" class="noVNC_panel">
                <div class="noVNC_heading"><img alt="" src="/novnc/app/images/clipboard.svg"> Paste & Type</div>
                <div style="margin:10px 0"><label for="pve_layout">VM Layout:</label>
                <select id="pve_layout"><option value="azerty" selected>AZERTY</option><option value="qwerty">QWERTY</option></select></div>
                <div style="margin:10px 0"><label for="pve_delay">Delay (ms):</label>
                <input id="pve_delay" type="number" value="2" min="0" max="1000" step="1"></div><hr>
                <textarea id="pve_text" rows="8"></textarea><hr>
                <input type="button" id="pve_type_btn" value="Type text">
                <div id="pve_status" style="display:none;margin-top:10px;padding:8px;border-radius:4px"></div>
            </div></div>
            <!-- PVE_PASTE_TYPE_END -->"""

script_block = """    <!-- PVE_PASTE_TYPE_SCRIPT -->
    <script src="/novnc/app/ui-exporter.js"></script>
    <script src="/novnc/app/paste-text-injector.js"></script>"""

block_pattern = re.escape(BLOCK_START) + r'.*?' + re.escape(BLOCK_END)
script_pattern = re.escape('    ' + SCRIPT_MARKER) + r'(?:\n\s*<script src="[^"]*(?:ui-exporter|paste-text-injector)\.js"></script>)*'

if re.search(block_pattern, text, flags=re.S):
    text = re.sub(block_pattern, block, text, flags=re.S, count=1)
elif '            <!-- Toggle fullscreen -->' in text:
    text = text.replace('            <!-- Toggle fullscreen -->', block + '\n            <!-- Toggle fullscreen -->', 1)
else:
    text = text.replace('</body>', block + '\n</body>', 1)

clipboard_pattern = r'\n\s*<!-- Clipboard -->.*?(?=<!-- PVE_PASTE_TYPE_START -->)'
if re.search(clipboard_pattern, text, flags=re.S):
    text = re.sub(clipboard_pattern, '\n' + clipboard_block + '\n', text, flags=re.S, count=1)
elif 'noVNC_clipboard_button' not in text:
    text = text.replace('<!-- PVE_PASTE_TYPE_START -->', clipboard_block + '\n<!-- PVE_PASTE_TYPE_START -->', 1)

clipboard_start = '  /* ------^-------\n   *    /POWER\n   * ==============\n   *   CLIPBOARD\n   * ------v------*/'
clipboard_end = '  /* ------^-------\n   *  CONNECTION\n   * ==============\n   * ------v------*/'
if clipboard_start in app_text and clipboard_end in app_text:
    start = app_text.index(clipboard_start)
    end = app_text.index(clipboard_end, start)
    app_text = app_text[:start] + app_text[end:]

app_text = re.sub(
    r'\n  /\* ------\^-------\n   \*    /POWER\n   \* ==============\n   \*   CLIPBOARD\n   \* ------v------\*/\n  openClipboardPanel\(\) \{.*?(?=\n  openConnectPanel\(\) \{)',
    '\n',
    app_text,
    flags=re.S,
    count=1,
)

if re.search(script_pattern, text, flags=re.S):
    text = re.sub(script_pattern, script_block, text, flags=re.S, count=1)
else:
    text = text.replace('</body>', script_block + '\n</body>', 1)

app_text = app_text.replace('    UI.addClipboardHandlers();\n', '')
app_text = app_text.replace(
    '    if (me.consoletype === "kvm") {\n      document.getElementById("noVNC_clipboard_button").classList.add("pve_hidden");\n    }\n',
    '',
)
app_text = app_text.replace(
    '          if (result.data.clipboard === "vnc") {\n            document.getElementById("noVNC_clipboard_button").classList.remove("pve_hidden");\n          }\n',
    '',
)
app_text = app_text.replace(
    '    document.getElementById("noVNC_clipboard_button").addEventListener("click", UI.toggleClipboardPanel);\n    document.getElementById("noVNC_clipboard_text").addEventListener("change", UI.clipboardSend);\n',
    '',
)
app_text = app_text.replace(
    '      document.getElementById("noVNC_clipboard_button").classList.add("noVNC_hidden");\n',
    '',
)
app_text = app_text.replace(
    '      document.getElementById("noVNC_clipboard_button").classList.remove("noVNC_hidden");\n',
    '',
)

if 'closeClipboardPanel() {' not in app_text:
    app_text = app_text.replace(
        '  addClipboardHandlers() {\n  },\n  // Add a call to save settings when the element changes,\n',
        '  addClipboardHandlers() {\n  },\n' + clipboard_methods + '  // Add a call to save settings when the element changes,\n',
        1,
    )

template.write_text(text)
app_js.write_text(app_text)
PY

    systemctl restart pveproxy
}

uninstall() {
    if ! pm_restore_latest_backup; then
        python3 <<'PY'
from pathlib import Path
import re

template = Path('/usr/share/novnc-pve/index.html.tpl')
text = template.read_text()
app_js = Path('/usr/share/novnc-pve/app.js')
app_text = app_js.read_text()
clipboard_pattern = r'\n\s*<!-- Clipboard -->.*?(?=<!-- PVE_PASTE_TYPE_START -->)'
text = text.replace('/novnc/app.js?ver=1.6.0-3&paste-type=2', '/novnc/app.js?ver=1.6.0-3')
text = re.sub(clipboard_pattern, '\n', text, flags=re.S, count=1)
text = re.sub(r'\n?\s*<!-- PVE_PASTE_TYPE_START -->.*?<!-- PVE_PASTE_TYPE_END -->\n?', '\n', text, flags=re.S)
text = re.sub(r'\n?\s*<!-- PVE_PASTE_TYPE_SCRIPT -->\n(?:\s*<script src="[^"]*(?:ui-exporter|paste-text-injector)\.js"></script>\n?)*', '\n', text, flags=re.S)
text = text.replace('window.UI = UI; UI.start({', 'UI.start({', 1)
clipboard_start = '  /* ------^-------\n   *    /POWER\n   * ==============\n   *   CLIPBOARD\n   * ------v------*/'
clipboard_end = '  /* ------^-------\n   *  CONNECTION\n   * ==============\n   * ------v------*/'
if clipboard_start in app_text and clipboard_end in app_text:
    start = app_text.index(clipboard_start)
    end = app_text.index(clipboard_end, start)
    app_text = app_text[:start] + app_text[end:]

app_text = re.sub(
    r'\n  /\* ------\^-------\n   \*    /POWER\n   \* ==============\n   \*   CLIPBOARD\n   \* ------v------\*/\n  openClipboardPanel\(\) \{.*?(?=\n  openConnectPanel\(\) \{)',
    '\n',
    app_text,
    flags=re.S,
    count=1,
)
app_text = app_text.replace('    UI.addClipboardHandlers();\n', '')
app_text = app_text.replace(
    '    if (me.consoletype === "kvm") {\n      document.getElementById("noVNC_clipboard_button").classList.add("pve_hidden");\n    }\n',
    '',
)
app_text = app_text.replace(
    '          if (result.data.clipboard === "vnc") {\n            document.getElementById("noVNC_clipboard_button").classList.remove("pve_hidden");\n          }\n',
    '',
)
app_text = app_text.replace(
    '    document.getElementById("noVNC_clipboard_button").addEventListener("click", UI.toggleClipboardPanel);\n    document.getElementById("noVNC_clipboard_text").addEventListener("change", UI.clipboardSend);\n',
    '',
)
app_text = app_text.replace(
    '      document.getElementById("noVNC_clipboard_button").classList.add("noVNC_hidden");\n',
    '',
)
app_text = app_text.replace(
    '      document.getElementById("noVNC_clipboard_button").classList.remove("noVNC_hidden");\n',
    '',
)

if 'closeClipboardPanel() {' not in app_text:
    app_text = app_text.replace(
        '  addClipboardHandlers() {\n  },\n  // Add a call to save settings when the element changes,\n',
        '  addClipboardHandlers() {\n  },\n' + clipboard_methods + '  // Add a call to save settings when the element changes,\n',
        1,
    )
template.write_text(text)
app_js.write_text(app_text)
PY
    fi

    rm -f "$PM_BACKUP_ROOT/$PM_PLUGIN_NAME/latest"
    rm -f "$JS_DEST" "$UI_DEST" "$SVG_DEST"

    systemctl restart pveproxy
}

case "${1:-}" in
    install) install ;;
    uninstall) uninstall ;;
    status) status ;;
    *) exit 1 ;;
esac
