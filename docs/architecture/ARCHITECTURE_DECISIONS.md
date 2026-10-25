# Architecture Decisions

- Primary language: TypeScript on Node.js.
- MCP SDK: @modelcontextprotocol/sdk with stdio transport.
- Validation: zod schemas.
- File identification: file-type magic numbers plus custom signature scan.
- Images: sharp.
- PDF: pdf-parse (PDFParse).
- Archives: adm-zip.
- Text encoding: chardet (best-effort).
- Output isolation: all writes under configured output root.
- Original files never modified.
- Jobs tracked in memory by ID.
