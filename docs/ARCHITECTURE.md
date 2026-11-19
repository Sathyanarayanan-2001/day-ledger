# Architecture

Day ledger is a static single-page app with no backend.

## Source layout

| File | Purpose |
| --- | --- |
| `src/core.js` | Dates, data model, time arithmetic, keyword matching, quick-log parser, merging. No DOM access. |
| `src/sync.js` | IndexedDB storage and folder sync. |
| `src/app.js` | Pages, dialogs, charts, exports and the focus timer. |
| `src/app.css` | Styles and light and dark themes. |
| `src/sw.js` | Service worker: network first, cached page offline. Shows reminders and opens the day when one is tapped. |
| `scripts/remind.mjs` | Sends a reminder push to each device. Run by `.github/workflows/reminders.yml`. |

## Data model

- **Project:** ID, name, description, planned dates.
- **Task:** optional project, optional parent (a sub-task), status and history, planned time, percent complete.
- **Log:** date, optional start time, minutes, category, optional project and task.
- **Category:** colour, work or personal, whether it nests inside tasks, whether it skips project matching.

Planned time lives on tasks and actual time is added up from logs. A task can therefore have any number of sittings, and actual dates are derived.

## Time rules

- Nesting categories are subtracted from timed logs they overlap. Overlaps are merged first, so no minute comes off twice.
- Entries crossing midnight become one log per day.
- Weeks are ISO 8601. Financial years run 1 April to 31 March.

## Sync

Every record has an update time `u`. Deletions are kept as tombstones so they can travel between devices.

- Save files are named `tracker-save-<UTC time>-<device>.json.gz`.
- A session writes one file, overwriting it as work continues. Older files beyond the newest 3 are removed.
- Before each save, and on opening, every unread save is merged record by record, and the newest `u` wins.
- A file that can't be read yet is skipped and tried again, because sync apps can deliver files partway through.

Browsers can't reliably finish writing a file while a tab closes, so saving happens about 3 seconds after each change.

## Reminders

The app has no server, so a scheduled GitHub workflow stands in for one.

- On each device, Settings subscribes to Web Push with the public key `PUSH_KEY`. The subscription, called the device key in the app, is saved as a `PUSH_SUB_*` repository secret.
- Twice a day `scripts/remind.mjs` signs with the `VAPID_PRIVATE_KEY` secret and pushes `{ "kind": "morning" }` or `{ "kind": "night" }` to every device. It fails the run if a device has expired, so GitHub emails about it.
- The service worker turns the kind into a notification. A tap opens `#log/today` or `#log/yesterday`, and the app then shows plain `#log` on that date.
- When the last commit is 50 or more days old, the night push also carries `pauseIn`, and the service worker shows a warning. GitHub stops scheduled runs in public repositories after 60 days without activity.

## Build

`scripts/build.mjs` inlines the libraries, font, CSS and JavaScript into `dist/index.html`. Update a library by changing `package.json`, then run `npm test`.
