# RC-3 historical cleanup archive record

Status: operator-local archival record, not RC-3 execution evidence.

The approved cleanup used archive ID `rc3-v1-v15-prune-20260824`. Its private host locator is intentionally omitted. The archive preserves selected materialized historical development files while the repository retains every V1 through V15 versioned contract record.

## Scope qualification

Archive verification covers the selected files that existed when cleanup began. It does not establish a complete V1 source closure. The V1 contract already recorded six implementation files as unavailable before archival.

The repository archive contains 164 files:

- 152 materialized V2 through V15 executable entrypoints, libraries, and freeze scripts
- 12 materialized V4 through V15 focused tests

The external archive contains 308 files from 22 historical evidence and build directories. Another 54 transient seed, runner, and preflight directories were removed under the approved plan without being represented as retained evidence. All 15 historical contract directories and all six active V16 external directories were retained. Credential directories were excluded and were not touched.

## Byte-identity records

| Archive object | Size | SHA-256 | Verification |
|---|---:|---|---|
| `repository-v1-v15-superseded.zip` | 770810 bytes | `9a191ac5d63994b4e07ee29518b90330a5df374eebee01dadb3c47e1e2e4c417` | 164 entries extracted and hashed against the selected-file manifest |
| `external-evidence-builds-v1-v15.zip` | 337211 bytes | `668b6e36558ab7d6adb615d68ed96129fbb5a2b05d068f262333eadf98c7a008` | 308 entries extracted and hashed against the selected-file manifest |
| `recursus-rc3-v15-image.tar` | 263095808 bytes | `bde27305e6ae827877cac2975803eb6556b0d30d428872c2f13e84db6c3e8004` | 52 tar entries listed and the tar hash rechecked |
| `archive-index.json` | 1798 bytes | `f939921c888d6c01ba9b28b2237b4dfd19db3f1a485129e5685c1adc4253e56b` | index hash recorded after reconciliation |
| `archive-qualification.json` | 598 bytes | `7a719cbd1d93987e0fadd6d6fd77ad7f70f93943eb81e0d0be76f8304261e747` | append-only V1 source-closure qualification |
| `repository-files.manifest.json` | 27751 bytes | `6a4491a6c2fb8c16ca5102e2f79187c7f648d6711df96c2d2a2c6d135ce16782` | selected repository inventory |
| `external-files.manifest.json` | 63013 bytes | `5bdebc55cf6761ea2d34e5b6a6ddb2c4399da0fd981dd3234e8efc497f4fb22c` | selected external inventory |

These hashes establish byte identity only. This record does not promote a historical contract or make a quality, safety, factuality, parity, advancement, comparative, application, or hiring claim.
