"""Print the Claude Desktop config snippet for the Envoy MCP server (`make mcp-config`)."""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def snippet() -> dict:
    return {"mcpServers": {"envoy": {
        # Claude Desktop does not inherit your shell PATH, so use uv's absolute path.
        "command": shutil.which("uv") or "uv",
        "args": ["run", "--directory", str(ROOT), "python", "-m", "services.mcp.server"],
        "env": {"ENVOY_URL": "http://localhost:8000"},
    }}}


if __name__ == "__main__":
    print(json.dumps(snippet(), indent=2))
    print("# Merge into ~/Library/Application Support/Claude/claude_desktop_config.json and restart Claude Desktop.",
          file=sys.stderr)
