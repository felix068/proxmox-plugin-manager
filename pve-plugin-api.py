#!/usr/bin/env python3
import json
import os
import subprocess
import syslog
from http.server import BaseHTTPRequestHandler, HTTPServer

PLUGIN_ROOT = "/usr/share/pve-manager/plugins"
PLUGINS = {
    "console-tab": os.path.join(PLUGIN_ROOT, "console-tab", "plugin.sh"),
    "firewall-batch": os.path.join(PLUGIN_ROOT, "firewall-batch", "plugin.sh"),
    "oneshot-create": os.path.join(PLUGIN_ROOT, "oneshot-create", "plugin.sh"),
    "paste-type": os.path.join(PLUGIN_ROOT, "paste-type", "plugin.sh"),
    "vm-folders": os.path.join(PLUGIN_ROOT, "vm-folders", "plugin.sh"),
    "xterm-clipboard": os.path.join(PLUGIN_ROOT, "xterm-clipboard", "plugin.sh"),
}
FOLDERS_FILE = "/etc/pve/vm-folders.json"


def load_folders():
    try:
        with open(FOLDERS_FILE, "r", encoding="utf-8") as handle:
            data = json.load(handle)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_folders(data):
    try:
        with open(FOLDERS_FILE, "w", encoding="utf-8") as handle:
            json.dump(data, handle, separators=(",", ":"), ensure_ascii=False)
        return True
    except Exception as exc:
        return str(exc)


def log(msg):
    syslog.openlog("pve-plugin-api", syslog.LOG_PID, syslog.LOG_AUTH)
    syslog.syslog(syslog.LOG_WARNING, msg)
    syslog.closelog()


def run_script(script, action, timeout=30):
    return subprocess.run(
        ["bash", script, action],
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=os.path.dirname(script),
    )


def read_plugin_meta(name):
    meta_path = os.path.join(PLUGIN_ROOT, name, "meta.json")
    meta = {
        "id": name,
        "name": name,
        "description": "",
        "version": "unknown",
    }
    try:
        with open(meta_path, "r", encoding="utf-8") as handle:
            loaded = json.load(handle)
        if isinstance(loaded, dict):
            meta.update(
                {
                    "id": loaded.get("id", meta["id"]),
                    "name": loaded.get("name", meta["name"]),
                    "description": loaded.get("description", meta["description"]),
                    "version": loaded.get("version", meta["version"]),
                }
            )
    except Exception:
        pass
    return meta


def plugin_enabled(name):
    script = PLUGINS.get(name)
    if not script or not os.path.exists(script):
        return False
    try:
        result = run_script(script, "status", timeout=15)
        return result.returncode == 0
    except Exception:
        return False


def list_plugins():
    plugins = []
    for name in sorted(PLUGINS):
        meta = read_plugin_meta(name)
        meta["enabled"] = plugin_enabled(name)
        plugins.append(meta)
    return plugins


def run_plugin(name, action):
    if name not in PLUGINS or action not in ["install", "uninstall"]:
        return {"success": False, "error": f"Invalid: {name} {action}"}
    script = PLUGINS[name]
    if not os.path.exists(script):
        return {"success": False, "error": f"Not found: {script}"}
    try:
        log(f"{name} {action}")
        result = run_script(script, action)
        return {
            "success": result.returncode == 0,
            "output": result.stdout + result.stderr,
            "error": None if result.returncode == 0 else f"Exit: {result.returncode}",
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Timeout 30s"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def send_json(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def read_body_json(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        return json.loads(raw) if raw else {}

    def do_GET(self):
        if self.path == "/folders":
            return self.send_json(200, load_folders())
        if self.path == "/plugins":
            return self.send_json(200, {"plugins": list_plugins()})
        self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path == "/folders":
            try:
                data = self.read_body_json()
                result = save_folders(data)
                if result is True:
                    return self.send_json(200, {"success": True})
                return self.send_json(500, {"error": result})
            except Exception as exc:
                return self.send_json(400, {"error": str(exc)})

        if self.path not in ["/install", "/uninstall"]:
            return self.send_json(404, {"error": "Not found"})

        try:
            data = self.read_body_json()
        except Exception:
            return self.send_json(400, {"error": "Invalid JSON"})

        plugin = data.get("plugin")
        if not plugin:
            return self.send_json(400, {"error": "Missing plugin"})
        self.send_json(200, run_plugin(plugin, self.path[1:]))


if __name__ == "__main__":
    print("PVE Plugin API on http://127.0.0.1:8007")
    HTTPServer(("127.0.0.1", 8007), Handler).serve_forever()
