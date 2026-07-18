# Guest List Backend — Setup Guide

The website is static (it can stay on GitHub Pages), but the guest list can
still be real: RSVPs are delivered to a **private Google Sheet in your own
Google account**, via a small Google Apps Script "web app". The footer
**Guest list** dashboard then shows every RSVP from every guest's device,
protected by a passcode that is **verified on Google's servers** — it never
appears anywhere in the website's source code.

Total setup time: about 10 minutes. Everything used here is free.

## What you get

| | Without backend (default) | With backend |
|---|---|---|
| Where RSVPs go | Only the guest's own browser | Your private Google Sheet |
| Dashboard shows | RSVPs made on that device only | **All** RSVPs, live |
| Passcode checked | In the browser (visible in page source) | On Google's servers (secret) |
| Export to Excel / CSV | ✅ (device data) | ✅ (full guest list) |

## Step 1 — Create the Google Sheet

1. Go to [sheets.new](https://sheets.new) (logged into the Google account
   that should own the guest list).
2. Name the spreadsheet something like **Wedding RSVPs**.

That's it — the script creates its own tab (named `RSVPs`) with headers the
first time an RSVP arrives.

## Step 2 — Add the Apps Script

1. In that spreadsheet, open **Extensions → Apps Script**.
2. Delete the placeholder code in the editor.
3. Copy the entire contents of
   [`backend/google-apps-script/Code.gs`](backend/google-apps-script/Code.gs)
   from this repository and paste it in.
4. Near the top, change this line to your own secret passcode:

   ```js
   var ADMIN_PASSCODE = "change-me-please";
   ```

   This is the passcode you'll type into the website's **Guest list**
   dashboard. It lives only inside your Google account.
5. Click the 💾 save icon (or Ctrl/Cmd + S).

## Step 3 — Deploy it as a web app

1. Click **Deploy → New deployment**.
2. Click the ⚙️ gear next to "Select type" and choose **Web app**.
3. Set:
   - **Execute as:** `Me (your@email)`
   - **Who has access:** `Anyone`

   > "Anyone" only means anyone can *submit an RSVP* or *ask* for the list —
   > the list itself is only returned when the correct passcode is sent.
   > Nobody can open or edit your spreadsheet.
4. Click **Deploy**, then **Authorize access** and allow the permissions
   (Google shows an "unverified app" warning for your own scripts —
   click *Advanced → Go to … (unsafe)*; it's your own code).
5. Copy the **Web app URL** (it ends in `/exec`).

## Step 4 — Connect the website

Open `config.js` and paste the URL:

```js
backendUrl: "https://script.google.com/macros/s/XXXXXXXX/exec",
```

Commit / upload the change to wherever the site is hosted. Done.

## Step 5 — Test it

1. Open the website and submit a test RSVP — the button shows *Sending…*,
   and a new row appears in your Google Sheet.
2. Click **Guest list** in the footer, enter your passcode → the dashboard
   shows live data from the Sheet (marked *"Live · synced from your Google
   Sheet"*), with **Export Excel** (`.xlsx`) and **Export CSV** buttons.
3. Enter a wrong passcode → it is rejected (by Google's servers).

## Everyday use

- **Viewing:** use the website dashboard, or just open the Google Sheet.
- **Exporting:** the dashboard's **Export Excel** button downloads a real
  `.xlsx` workbook (bold frozen header row, sized columns) generated right
  in the browser — no add-ins or libraries needed. CSV is also available.
- **Editing/removing entries:** edit rows directly in the Google Sheet —
  it is the source of truth.
- **Clearing the whole list:** the dashboard's **Clear guest list** button
  deletes every RSVP from the Sheet. It is passcode-protected: you must
  re-enter the access passcode to confirm, and the check happens on
  Google's servers (same as unlocking). If you ever clear by mistake,
  the Sheet's **File → Version history** can restore the data.
  *(Deployed the backend before this feature existed? Paste the latest
  `Code.gs` over the old one and publish a new version — see below.)*
- **Changing the passcode:** edit `ADMIN_PASSCODE` in the Apps Script, then
  **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**.
  (Any edit to the script needs that "new version" step to go live.)

## Notes & troubleshooting

- **The wish wall** on the site still shows wishes saved in each visitor's
  own browser. This is deliberate: there is no public endpoint that exposes
  guest data.
- **"Couldn't reach the guest-list service"** — check that `backendUrl`
  ends in `/exec`, the deployment's access is set to `Anyone`, and you
  published a *new version* after your last edit.
- **RSVPs stop being accepted after 5,000 entries** (`MAX_ENTRIES` in
  `Code.gs`) — a safety cap against abuse; raise it if you somehow need to.
- If you ever want to shut the backend off, disable or archive the
  deployment in **Deploy → Manage deployments**, and clear `backendUrl`
  in `config.js`. The site falls back to local demo mode automatically.
