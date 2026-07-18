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
 *   2. Change ADMIN_PASSCODE below to your own secret.
 *   3. Deploy → New deployment → Web app:
 *        Execute as: Me   ·   Who has access: Anyone
 *   4. Copy the web app URL (ends in /exec) into config.js → backendUrl.
 *
 * After editing this file you must publish a new version:
 * Deploy → Manage deployments → ✏️ → Version: New version → Deploy.
 */

// ⚠️ CHANGE THIS. It is the passcode for the guest-list dashboard.
// It lives only in your Google account — website visitors cannot see it.
var ADMIN_PASSCODE = "2026annwedsmaschio";

var SHEET_NAME = "RSVPs";
var HEADERS = ["Timestamp", "Name", "Email", "Attendance", "Guests", "Diet", "Wishes"];
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
  var email = clean_(body.email, 160);
  if (!name || !email) return json_({ ok: false, error: "missing_fields" });

  var attendance = body.attendance === "attending" ? "attending" : "declined";
  var guests = parseInt(body.guests, 10);
  if (isNaN(guests) || guests < 0) guests = 0;
  if (guests > 20) guests = 20;
  var diet = clean_(body.diet, 40) || "none";
  var wishes = clean_(body.wishes, 1000);
  var timestamp = clean_(body.timestamp, 40) ||
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  // serialize concurrent submissions so rows never interleave
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet_();
    if (sheet.getLastRow() - 1 >= MAX_ENTRIES) {
      return json_({ ok: false, error: "list_full" });
    }
    sheet.appendRow([timestamp, name, email, attendance, guests, diet, wishes]);
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
      email: String(r[2]),
      attendance: String(r[3]),
      guests: Number(r[4]) || 0,
      diet: String(r[5]),
      wishes: String(r[6])
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
  }
  return sheet;
}

function passcodeOk_(supplied) {
  var a = String(supplied || "");
  var b = String(ADMIN_PASSCODE);
  if (a.length !== b.length) return false;
  var diff = 0; // compare every character so timing reveals nothing
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function clean_(v, max) {
  return String(v == null ? "" : v)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, max);
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
