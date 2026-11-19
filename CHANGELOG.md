# Changelog

Notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-11-19

### Added

- Morning and night reminders to log your day, sent by a scheduled GitHub workflow. Set up in Settings > Reminders.
- Reminder taps open today, or yesterday from the morning reminder's Fill yesterday button.
- Links straight to a day: `#log/today`, `#log/yesterday` or `#log/2026-11-18`.
- A warning before GitHub pauses the reminders after 60 days with no commits.

### Changed

- Browser tests run on full Chromium in headless mode, so notifications can be tested.

## [1.1.0] - 2026-11-02

### Added

- Guide page, opened on first visit, with links to every section.
- Settings and Guide links on the Home page.
- Automated browser tests, and a build and deploy pipeline.

### Changed

- Sync now uses a chosen folder only. OneDrive's own apps carry the files.
- Every unread save is merged, so files delivered late aren't missed.
- Updated jsPDF to 4.2.1, jspdf-autotable to 5.0.9 and Chart.js to 4.6.1.
- Reorganised the repository around `src/`, with a generated `dist/`.

### Fixed

- A save overwritten by another device during its session is now picked up.
- A half-delivered save file no longer stops sync.

### Removed

- Direct OneDrive sign-in and all Microsoft Graph code.

## [1.0.0] - 2026-11-02

### Added

- First release: quick log, day timeline, projects, dashboard, entries, exports, import and focus timer.
