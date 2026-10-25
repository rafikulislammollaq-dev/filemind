# Security Policy

## Reporting a vulnerability
Email the maintainer or open a private security advisory. Do not file public issues for undisclosed vulnerabilities.

## Security model
- Input paths restricted to configured roots (`RBC_ALLOWED_INPUTS`).
- All writes confined to output root (`RBC_OUTPUT_DIR`).
- Path traversal rejected in inputs and archive entries.
- Symlink escapes rejected via realpath checks.
- File size, item count, archive depth, runtime limits enforced.
- External tools invoked with argument arrays (no shell interpolation); jadx uses shell only for .bat shim.
- No network access; no telemetry.
- Original files never modified.
- Recovered artifacts validated before reporting success.

## Threat model
Files are untrusted. Parsers run in-process; risky external tools run as subprocesses with timeouts. Strong sandboxing is not claimed beyond subprocess isolation and timeouts.
