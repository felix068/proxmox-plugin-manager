#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in {"install", "uninstall", "status"}:
        print("Usage: python install.py [install|uninstall|status]")
        return 1

    plugin_script = Path(__file__).with_name("plugin.sh")
    result = subprocess.run(["bash", str(plugin_script), sys.argv[1]])
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
