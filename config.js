// --- WEDDING INVITATION CONFIGURATION ---
// All copy on the page is driven by this file. Edit the values below and
// reload — no other file needs to change.
const WEDDING_CONFIG = {
    groomName: "Maschio",
    brideName: "Ann Sweety",
    initials: "M & A",
    cardInviteMsg: "You are cordially invited to share in our joy.",
    weddingDateText: "September 24, 2026",
    rsvpDeadlineText: "September 1, 2026",
    // Drives the countdown timer. Keep the +05:30 (IST) offset: it pins the
    // countdown to the actual moment of the ceremony in New Delhi, so guests
    // in any timezone see the same, correct time remaining. (The event times
    // below intentionally have NO offset — they are venue-local "wall clock"
    // times used for display and the calendar file.)
    countdownTarget: "2026-09-24T16:00:00+05:30",

    // --- GUEST LIST BACKEND (recommended — see BACKEND_SETUP.md) ---
    // URL of your Google Apps Script web app (ends in "/exec"). When set:
    //   • every RSVP is delivered to your private Google Sheet, from ANY
    //     guest's device — this becomes the real, shared guest list;
    //   • the "Guest list" dashboard (footer) asks for the passcode you set
    //     inside the Apps Script, and the check happens on Google's servers.
    //     That passcode is NOT in this file and NOT visible in page source;
    //   • the dashboard shows live data from the Sheet, with built-in
    //     Export to Excel (.xlsx) and CSV.
    // Leave blank to run in local-only demo mode (see adminPasscode below).
    backendUrl: "https://script.google.com/macros/s/AKfycby7_YWwruAx5qCM_Rnk5eXGoSsw5WrneCKo6fqw2H0Fi4qZs4pINxG0r-X6Nk5Ytwlq/exec",

    // Passcode for the DEMO (local-only) dashboard, used ONLY while
    // backendUrl above is blank. In that mode the code is checked in the
    // guest's own browser and is visible to anyone who views the page
    // source — treat it as a light deterrent, not real security. Once
    // backendUrl is set, this value is ignored entirely.
    adminPasscode: "2026",

    // Optional extra: a generic form-backend endpoint (e.g. Formspree,
    // Getform) that receives a JSON copy of each RSVP — handy for email
    // notifications. Independent of backendUrl. Leave blank to disable.
    rsvpWebhookUrl: "",

    events: {
        ceremony: {
            title: "Wedding Ceremony",
            time: "Thursday, 4:00 PM – 5:00 PM",
            venue: "Cathedral Church of The Redemption",
            address: "1 Church Road, North Avenue, New Delhi 110001",
            mapLink: "https://maps.google.com/maps?q=Cathedral+Church+of+The+Redemption+1+Church+Road+North+Avenue+New+Delhi+110001",
            startISO: "2026-09-24T16:00:00",
            endISO: "2026-09-24T17:00:00"
        },
        reception: {
            title: "Grand Reception",
            time: "Thursday, 7:00 PM – 11:00 PM",
            venue: "Cathedral Church of The Redemption",
            address: "1 Church Road, North Avenue, New Delhi 110001",
            mapLink: "https://maps.google.com/maps?q=Cathedral+Church+of+The+Redemption+1+Church+Road+North+Avenue+New+Delhi+110001",
            startISO: "2026-09-24T19:00:00",
            endISO: "2026-09-24T23:00:00"
        }
    }
};

window.WEDDING_CONFIG = WEDDING_CONFIG;
