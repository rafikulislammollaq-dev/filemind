# FileMind Installation

## Clone and install (for humans and AI agents)

```bash
git clone <repo-url> filemind
cd filemind
npm ci
npm run build
npm test
```

`npm ci` installs all dependencies from `package-lock.json`. `npm run build` compiles TypeScript to `dist/`. `npm test` runs the integration + security checks.

If `npm ci` reports stale dependencies, run `npm install` then `npm run build`.

### Prerequisites
- Node.js 20+ (tested on 24.x)
- Optional: `sqlite3` CLI for SQLite inspection/recovery (auto-detected; absence is reported, not fatal).
- Optional external tools for advanced recovery: `qpdf`, `7z`, `ffmpeg`, `exiftool` (auto-detected via `list_capabilities`).

## Running the MCP server

```bash
node dist/index.js
```

The server uses stdio transport. Do not print logs to stdout.

## MCP client configuration

### OpenCode (V2 shape)

`~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "filemind": {
        "type": "local",
        "command": ["node", "/absolute/path/to/filemind/dist/index.js"],
        "environment": {
          "FILEMIND_ALLOWED_INPUTS": "/home/you,/tmp",
          "FILEMIND_OUTPUT_DIR": "/tmp/filemind-output"
        }
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add filemind node /absolute/path/to/filemind/dist/index.js
```

Or in `~/.claude.json`:

```json
{
  "mcpServers": {
    "filemind": {
      "command": "node",
      "args": ["/absolute/path/to/filemind/dist/index.js"],
      "env": {
        "FILEMIND_ALLOWED_INPUTS": "/home/you,/tmp",
        "FILEMIND_OUTPUT_DIR": "/tmp/filemind-output"
      }
    }
  }
}
```

### Codex

```toml
[mcp_servers.filemind]
command = "node"
args = ["/absolute/path/to/filemind/dist/index.js"]
```

## Environment variables

See README.md.

## Verify installation

```bash
npm test
node dist/index.js   # should print nothing and wait on stdin
```

Call `list_capabilities` from your MCP client to see available parsers and missing optional dependencies.

## For AI agents / harnesses

After cloning, run:
1. `npm ci`
2. `npm run build`
3. `npm test`

If any step fails, report the error. Do not modify source to bypass dependency checks. Optional missing tools are expected and surfaced by `list_capabilities`.
