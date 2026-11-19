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

## Reminders

A notification at about 8:00 am and 10:30 pm India time reminds you to log. The morning one has **Log today** and **Fill yesterday** buttons. Tapping either reminder opens that day in **Log time**, where the unlogged gaps are shown.

A scheduled GitHub workflow, `.github/workflows/reminders.yml`, sends the reminders through each browser's own push service. A reminder holds only the words "morning", "night" or "test", never your entries.

### Once, for the repository

1. On GitHub, go to **Settings > Secrets and variables > Actions > New repository secret**.
2. Name it `VAPID_PRIVATE_KEY` and paste the private key. It pairs with `PUSH_KEY` in `src/app.js`.

To make a new key pair, run `npx web-push generate-vapid-keys`. Put the public key in `PUSH_KEY` and the private key in the secret. After a new pair, turn reminders on again on every device.

### On each device

1. Open the installed app. On Android, that's the home-screen icon.
2. Go to **Settings > Reminders**, tap **Turn on for this device** and allow notifications.
3. Tap **Copy key**, then open **New repository secret** from the link there.
4. Name the secret `PUSH_SUB_PHONE`, paste the key and save. Give each device its own name after `PUSH_SUB_`, such as `PUSH_SUB_LAPTOP`.
5. Back in the app, tap **I've added it**, then **Send a test**.

To check the whole route from GitHub, open **Actions > Reminders > Run workflow** and choose `test`.

Laptops only get reminders while Chrome or Edge is running, even in the background. Android phones get them when the app is closed.

### Changing the times

Edit the two `cron` lines in `.github/workflows/reminders.yml`. They're in UTC, which is India time minus 5 hours 30 minutes. Set them a few minutes early, because GitHub often starts scheduled runs late. A run before 3 pm India time sends the morning reminder, and a later run sends the night one.

### If reminders stop

| What you see | What to do |
| --- | --- |
| GitHub emails that a Reminders run failed | Open the run. The error names the device secret or setting to fix. |
| A device's secret "has expired" | On that device, turn reminders off and on again, then replace its secret with the new key. |
| "Reminders pause in N days" | GitHub stops scheduled runs in public repositories after 60 days with no activity. Merge a Dependabot update or make any commit. |
| Runs have stopped | Open **Actions > Reminders** and choose **Enable workflow**. |
| Nothing arrives on a phone | Allow notifications for the app in Android settings, and turn off battery optimisation for Chrome. |

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
