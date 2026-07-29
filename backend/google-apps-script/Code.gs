/**
 * WEDDING RSVP BACKEND — Google Apps Script
 * ------------------------------------------------------------------
 * Stores every RSVP in a Google Sheet and serves the guest list to the
 * website's "Guest list" dashboard, protected by a passcode that is
 * verified HERE (on Google's servers) — it never appears in the site's
 * source code.
 *
 * Full setup instructions: BACKEND_SETUP.md in the website repository.
 * Quick version:
 *   1. Create a Google Sheet, open Extensions → Apps Script, and paste
 *      this whole file over the default Code.gs.
 *   2. Set the passcode in ⚙ Project Settings → Script Properties, as
 *      a property named ADMIN_PASSCODE. It is deliberately NOT in this
 *      file: the website repository is public, so anything written here
 *      is published — and stays in the git history even after it is
 *      edited out.
 *   3. Deploy → New deployment → Web app:
 *        Execute as: Me   ·   Who has access: Anyone
 *   4. Copy the web app URL (ends in /exec) into config.js → backendUrl.
 *
 * After editing this file you must publish a new version:
 * Deploy → Manage deployments → ✏️ → Version: New version → Deploy.
 * (Changing the script property alone takes effect immediately.)
 */

// The name of the script property holding the dashboard passcode. Until
// that property is set the dashboard cannot be unlocked at all — every
// privileged request is refused rather than falling open.
var PASSCODE_PROPERTY = "ADMIN_PASSCODE";

var SHEET_NAME = "RSVPs";
var HEADERS = ["Timestamp", "Name", "Phone", "Attendance", "Guests", "Wishes"];
var PHONE_COLUMN = 3;
var MAX_ENTRIES = 5000; // safety cap so an abusive script can't grow the sheet forever

// ------------------------------------------------------------------

function doGet() {
  // Lets you sanity-check the deployment by opening the /exec URL in a
  // browser. Returns no guest data.
  return json_({ ok: true, service: "wedding-rsvp-backend" });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: "bad_request" });
  }

  switch (String(body.action || "")) {
    case "rsvp": return handleRsvp_(body);
    case "list": return handleList_(body);
    case "clear": return handleClear_(body);
    default: return json_({ ok: false, error: "unknown_action" });
  }
}

// ---- public: a guest submits an RSVP (no passcode needed) ----
function handleRsvp_(body) {
  var name = clean_(body.name, 120);
  var phone = digits_(body.phone);
  if (!name || phone.length !== 10) return json_({ ok: false, error: "missing_fields" });

  var attendance = body.attendance === "attending" ? "attending" : "declined";
  var guests = parseInt(body.guests, 10);
  if (isNaN(guests) || guests < 0) guests = 0;
  if (guests > 20) guests = 20;
  var wishes = clean_(body.wishes, 1000);
  // Generated here, not taken from the request: a client-supplied
  // timestamp can be set to anything, including a date that reorders the
  // guest list or hides an entry among older rows.
  var timestamp = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  // serialize concurrent submissions so rows never interleave
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet_();
    var row = [timestamp, name, phone, attendance, guests, wishes];
    // The same guest answering twice — retrying after a bad connection, or
    // genuinely changing their mind — updates their row instead of adding a
    // second, contradicting one.
    var existing = findGuestRow_(sheet, name, phone);
    if (existing > 0) {
      sheet.getRange(existing, 1, 1, HEADERS.length).setValues([row]);
    } else {
      if (sheet.getLastRow() - 1 >= MAX_ENTRIES) {
        return json_({ ok: false, error: "list_full" });
      }
      sheet.appendRow(row);
    }
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

// ---- private: the couple opens the dashboard (passcode required) ----
function handleList_(body) {
  if (!passcodeOk_(body.passcode)) {
    return json_({ ok: false, error: "unauthorized" });
  }
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  var rows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues()
    : [];
  var entries = rows.map(function (r) {
    return {
      timestamp: cellToString_(r[0]),
      name: String(r[1]),
      phone: String(r[2]),
      attendance: String(r[3]),
      guests: Number(r[4]) || 0,
      wishes: String(r[5])
    };
  });
  return json_({ ok: true, entries: entries });
}

// ---- private: the couple wipes the guest list (passcode required) ----
// Deletes every RSVP row from the Sheet, keeping the header. Irreversible
// from the website — though Google Sheets' own File → Version history can
// still recover the data if this is ever pressed by mistake.
function handleClear_(body) {
  if (!passcodeOk_(body.passcode)) {
    return json_({ ok: false, error: "unauthorized" });
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

// ------------------------------------------------------------------

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    // plain text, so a phone number never loses a leading zero and is
    // never reinterpreted as a number in scientific notation
    sheet.getRange(1, PHONE_COLUMN, sheet.getMaxRows(), 1).setNumberFormat("@");
  }
  return sheet;
}

// Row number of an existing entry for this guest, or 0 for a new guest.
// "The same guest" means the same name AND the same phone number, so two
// people sharing one number still get a row each.
function findGuestRow_(sheet, name, phone) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  var key = name.toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    if (digits_(rows[i][2]) === phone &&
      String(rows[i][1]).trim().toLowerCase() === key) {
      return i + 2; // +1 for the header row, +1 because getValues is 0-based
    }
  }
  return 0;
}

function passcodeOk_(supplied) {
  var expected = PropertiesService.getScriptProperties().getProperty(PASSCODE_PROPERTY);
  // Fail closed: with no passcode configured there is nothing to check
  // against, so no request is privileged.
  if (!expected) return false;

  // Compared as fixed-length digests, so neither the timing of the loop
  // nor an early length check reveals anything about the real passcode.
  var a = sha256_(String(supplied == null ? "" : supplied));
  var b = sha256_(expected);
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function sha256_(text) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
}

function clean_(v, max) {
  return String(v == null ? "" : v)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
}

// A plain 10-digit local number. Anything else that arrives (spaces,
// dashes, a +91 prefix) is stripped; when a country code is present the
// last 10 digits are the ones kept, matching what the website sends.
function digits_(v) {
  var d = String(v == null ? "" : v).replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

function cellToString_(v) {
  // Sheets may auto-convert "2026-09-24 16:00:00" strings into Date cells
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  }
  return String(v);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
