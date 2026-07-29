# Guest List Backend — Setup Guide

The website is static (it can stay on GitHub Pages), but the guest list can
still be real: RSVPs are delivered to a **private Google Sheet in your own
Google account**, via a small Google Apps Script "web app". The footer
**Guest list** dashboard then shows every RSVP from every guest's device,
protected by a passcode that is **verified on Google's servers** — it never
appears anywhere in the website's source code.

Total setup time: about 10 minutes. Everything used here is free.

## What you get

| | Without backend | With backend |
|---|---|---|
| Where RSVPs go | Only the guest's own browser | Your private Google Sheet |
| Guest list dashboard | Stays locked | Unlocks, showing **all** RSVPs, live |
| Passcode checked | — nothing to check it against | On Google's servers (secret) |
| Export to Excel / CSV | — | ✅ (full guest list) |

There is deliberately no passcode anywhere in the website's files. Every
file the site serves — including `config.js` — is downloaded by every
visitor and readable with "View source", so a passcode kept there would be
public, and a check performed in the visitor's own browser is a check they
control. Without a backend the dashboard therefore stays locked rather
than pretending to be protected; RSVPs are still collected and still saved
on each guest's own device.

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
4. Click the 💾 save icon (or Ctrl/Cmd + S).

## Step 2b — Set your passcode (never in the code)

The passcode is **not** written in `Code.gs`. This repository is public, so
anything typed into that file gets published — and stays in the git history
even after it is edited out. It lives in the script's own properties
instead, which never leave your Google account:

1. In the Apps Script editor, open **⚙ Project Settings**.
2. Scroll to **Script Properties** → **Add script property**.
3. Property: `ADMIN_PASSCODE` — Value: *your secret passcode*.
4. **Save script properties.**

This is the passcode you'll type into the website's **Guest list**
dashboard. Until it is set, the dashboard cannot be unlocked at all: the
script refuses every request rather than falling open.

> ⚠️ **If you deployed an earlier version of `Code.gs`** — one that had
> `var ADMIN_PASSCODE = "…"` written inside it — then that passcode was
> published in this public repository and must be treated as compromised.
> Choose a **new** passcode, set it as a script property as above, and
> publish a new version. Anyone who read the old file could list or delete
> your guest list until you do.

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
- **A guest who answers twice** — retrying after a bad connection, or
  genuinely changing their mind — **updates their existing row** instead of
  adding a second, contradicting one. "The same guest" means the same name
  *and* the same phone number, so two people sharing one number still get a
  row each.
- **Clearing the whole list:** the dashboard's **Clear guest list** button
  deletes every RSVP from the Sheet. It is passcode-protected: you must
  re-enter the access passcode to confirm, and the check happens on
  Google's servers (same as unlocking). If you ever clear by mistake,
  the Sheet's **File → Version history** can restore the data.
  *(Deployed the backend before this feature existed? Paste the latest
  `Code.gs` over the old one and publish a new version — see below.)*
- **Changing the passcode:** edit the `ADMIN_PASSCODE` script property
  (**⚙ Project Settings → Script Properties**). Property changes take
  effect immediately — no redeploy needed. Editing `Code.gs` itself still
  does: **Deploy → Manage deployments → ✏️ → Version: New version →
  Deploy**.

## Notes & troubleshooting

- **The wish wall** on the site still shows wishes saved in each visitor's
  own browser. This is deliberate: there is no public endpoint that exposes
  guest data. A visitor who has not sent a wish yet sees three sample
  wishes; those are decoration only and are never part of the guest list,
  the dashboard counts, or the exports.
- **Phone numbers are stored as text**, so a leading zero is never dropped.
  The script sets that format when it creates the `RSVPs` tab. On a sheet
  created before this change, select column C and set
  **Format → Number → Plain text** once.
- **"Couldn't reach the guest-list service"** — check that `backendUrl`
  ends in `/exec`, the deployment's access is set to `Anyone`, and you
  published a *new version* after your last edit.
- **RSVPs stop being accepted after 5,000 entries** (`MAX_ENTRIES` in
  `Code.gs`) — a safety cap against abuse; raise it if you somehow need to.
- **Already deployed an older `Code.gs`?** Paste the latest one over it and
  publish a new version, then:
  - set the `ADMIN_PASSCODE` script property (Step 2b) — **to a new
    secret**, if your old one was ever written inside `Code.gs`. Without
    the property the dashboard stays locked for everyone.
  - if your `RSVPs` tab still has the old `Email`/`Diet` columns, the sheet
    layout changed too — the form now collects a **phone number instead of
    an email address** and the dietary question is gone, so the tab is
    `Timestamp · Name · Phone · Attendance · Guests · Wishes`. Either
    rename/delete the old tab (the script recreates it with the new
    headers) or fix the header row and columns by hand, otherwise new rows
    land under the wrong headings.
- If you ever want to shut the backend off, disable or archive the
  deployment in **Deploy → Manage deployments**, and clear `backendUrl`
  in `config.js`. The site falls back to local demo mode automatically.
