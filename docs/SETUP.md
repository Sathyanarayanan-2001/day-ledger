# Setup guide

Do this once on each device. It needs no Microsoft developer account or sign-in inside the app.

## How sync works

The app writes save files to a folder you choose. OneDrive's own apps move those files between devices. When the app opens, it merges any saves it hasn't read yet, entry by entry, and the newest edit wins. It keeps the last 3 sessions.

## Laptops (Windows, Chrome or Edge)

1. Check the OneDrive desktop app is running.
2. Create a folder such as `OneDrive\Day ledger`.
3. Open the [app](https://sathyanarayanan-2001.github.io/day-ledger/), go to **Settings** and choose **Choose sync folder**.
4. Pick the folder and allow access. Choose **Allow on every visit** if the browser offers it.

Use the same folder on every laptop. On a work laptop, IT policy may stop a personal OneDrive from syncing.

## Android phone

The OneDrive app doesn't keep a synced folder on the phone, so this needs a separate sync app.

1. Install a OneDrive sync app, such as OneSync, and check its free limits.
2. Set up two-way sync between the `Day ledger` OneDrive folder and a folder on the phone.
3. Open the app in Chrome, then use the Chrome menu and **Add to Home screen**. Installed apps keep folder permission.
4. Open it from the home screen, go to **Settings** and pick the phone folder.

Folder access needs Chrome 132 or later on Android.

## Check it works

1. Log an entry on the phone.
2. Let the sync app run.
3. Open the app on a laptop and check the entry is there.

## Importing an existing tracker

Go to **All entries** and choose **Import**. CSV and Excel files both work. Columns are matched by name, and you can correct the matches before importing. Rows already present are skipped.

## Backups

The sync folder holds only the last 3 sessions. To keep a long-term copy, go to **Settings** and choose **Download backup**. Restoring merges the backup into your current data.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| An entry is missing on another device | Check the sync app has run, then reopen the page. |
| Asked to allow folder access | Tap **Allow**. Browsers can ask again after a restart. |
| New browser, or browser data cleared | Choose the sync folder again and the last save loads. |
| No folder button | Use Chrome or Edge. Firefox and Safari can't open folders. |
