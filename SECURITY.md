# Security

## Reporting a problem

Please report security problems through [private vulnerability reporting](https://github.com/Sathyanarayanan-2001/day-ledger/security/advisories/new) rather than a public issue.

## Data

Entries stay in your browser and the folder you choose. The folder's protection is whatever your device and OneDrive provide, and save files aren't encrypted.

## Known issue

`xlsx` 0.18.5, the latest version on npm, has known advisories for crafted spreadsheets (GHSA-4r6h-8v6p-xvw6 and GHSA-5pgg-2g8v-p4x9). The fixed versions are published only on SheetJS's own site. The risk is limited because the app only opens files you choose, so import spreadsheets only from sources you trust.
