# Tool Reference

## identify_file
Input: `path` (required), `max_bytes`, `include_candidates`.
Output: detected format, MIME, size, SHA-256, signature matches, structural observations, confidence, warnings.

## inspect_file
General read-only inspection combining identification, metadata, integrity.

## inspect_metadata
Format-specific metadata fields with source attribution.

## analyze_integrity
Structural validity, errors, missing structures, truncation indicators, severity, recommended next steps.

## extract_content
Extracts readable content and embedded resources to an output directory; writes manifest.json.

## inspect_binary
Modes: hex, strings, signatures, structural, all. Bounded output.

## analyze_embedded_content
Scans for embedded file signatures with offsets and feasibility.

## recover_file
Strategies: auto, pdf_text_extraction, pdf_repair, zip_extract_intact, image_decode, image_transcode, text_normalize, sqlite_check, generic_copy.

## validate_recovery
Format recognition, integrity, decoding, byte-identical comparison.

## investigate_file
Bounded multi-step workflow producing JSON + Markdown report.

## get_recovery_report
Retrieve a prior job by ID.

## analyze_software
Optional reverse-engineering via jadx/rizin.

## list_capabilities
Installed parsers, tools, formats, limits, missing dependencies.
