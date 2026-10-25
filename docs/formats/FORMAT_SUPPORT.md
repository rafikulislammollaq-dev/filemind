# Format Support Matrix

| Format | Identify | Metadata | Integrity | Extract | Recover | Validate |
|---|---|---|---|---|---|---|
| PDF | yes | yes | yes | text | text extraction | parse |
| PNG/JPEG/GIF/WebP/BMP/TIFF | yes | yes (sharp) | decode | copy | decode check | decode |
| ZIP | yes | entries | entries | entries | intact entries | parse |
| gzip | yes | basic | basic | decompress | decompress | parse |
| DOCX/XLSX/PPTX | via ZIP | parts | via ZIP | parts | parts | zip parse |
| TXT and source | heuristic | encoding/lines | utf8/json | copy | normalize | parse |
| ELF/PE | signature | no | no | no | no | no |
| SQLite | signature | no | no | no | no | no |
| Audio/Video | no | no | no | no | no | no |
