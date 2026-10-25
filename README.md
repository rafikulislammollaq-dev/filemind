# FileMind — AI File Intelligence, Forensics & Recovery MCP

FileMind is a local-first Model Context Protocol (MCP) server that gives AI agents the ability to investigate, inspect, extract, diagnose, and recover information from files.

## What it does today

- Identify file formats from content signatures (not just extensions).
- Inspect metadata for images, PDFs, ZIP archives, text files.
- Analyze structural integrity and detect truncation/corruption.
- Inspect raw bytes (hex, strings, signatures, structural summary).
- Find embedded file signatures.
- Extract content from text, PDF, images, ZIP, gzip, and Office Open XML containers.
- Attempt recovery workflows (text extraction, archive entry extraction, image decode validation, text normalization, generic copy).
- Validate recovered artifacts.
- Run bounded multi-step investigations with reports.
- Report capabilities and missing optional dependencies.

## Installation

```bash
cd filemind
npm install
npm run build
```

Requires Node.js 20+.

## Running

```bash
npm start
# or
node dist/index.js
```

The server communicates over stdio (MCP).

## MCP client configuration (OpenCode example)

```json
{
  "mcpServers": {
    "filemind": {
      "command": "node",
      "args": ["C:/path/to/filemind/dist/index.js"],
      "env": {
        "FILEMIND_ALLOWED_INPUTS": "C:/Users/you,C:/tmp",
        "FILEMIND_OUTPUT_DIR": "C:/tmp/filemind-output"
      }
    }
  }
}
```

## Environment variables

- `FILEMIND_ALLOWED_INPUTS` — comma/semicolon separated allowed input roots (default: cwd, home, temp).
- `FILEMIND_OUTPUT_DIR` — output root (default: temp/filemind-output).
- `FILEMIND_TEMP_DIR` — temp root.
- `FILEMIND_MAX_INPUT_BYTES` — max input file size (default 100MB).
- `FILEMIND_MAX_OUTPUT_BYTES`, `FILEMIND_MAX_EXTRACTED_ITEMS`, `FILEMIND_MAX_ARCHIVE_DEPTH`, `FILEMIND_MAX_RUNTIME_MS`, `FILEMIND_MAX_INSPECT_BYTES`, `FILEMIND_MAX_BINARY_OUTPUT_BYTES`.

## Tools

identify_file, inspect_file, inspect_metadata, analyze_integrity, extract_content, inspect_binary, analyze_embedded_content, recover_file, validate_recovery, investigate_file, get_recovery_report, list_capabilities.

## Supported formats

Tier 1: PDF, JPEG, PNG, GIF, WebP, BMP, TIFF, ZIP, TAR, gzip, text/source formats.
Tier 2: DOCX, XLSX, PPTX (as ZIP containers), SQLite (identification only).
Tier 3: APK/JAR (ZIP-based), ELF/PE (identification).

## Limitations

- Advanced recovery tools (qpdf, 7-Zip, FFmpeg, ExifTool) are not bundled and were not detected in this environment; corresponding handlers are limited to bundled parsers.
- PDF recovery is limited to text extraction; full structural repair is not implemented.
- Image repair beyond decode validation is not implemented.
- Media (audio/video) handlers are not yet implemented.
- Network access is not used; all processing is local.
- Original files are never modified.

## Security

- Input paths are restricted to configured roots.
- Output writes are restricted to the output root.
- Path traversal and unsafe archive entries are rejected.
- Resource limits are enforced.

## Tests

```bash
npm test
```

25 tests (18 integration + 3 security + 4 e2e) currently pass.

## License

MIT
