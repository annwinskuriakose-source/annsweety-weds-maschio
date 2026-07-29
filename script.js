/* ============================================================
   ANN SWEETY & MASCHIO — "THE GOLDEN HOUR"
   A modern editorial wedding invitation.

   Motion:   GSAP + ScrollTrigger (choreography), Lenis (smooth
             scroll), and a small hand-rolled WebGL backdrop (flowing
             silk shader + drifting champagne dust behind the hero
             and footer).
   Data:     window.WEDDING_CONFIG (config.js) drives all copy.
             RSVPs persist to localStorage and, when a backend is
             configured (config.backendUrl → Google Apps Script +
             Google Sheet, see BACKEND_SETUP.md), are delivered to
             the couple's private sheet. The footer "Guest list"
             dashboard is passcode-protected — verified server-side
             in backend mode — and exports to Excel (.xlsx, built-in
             writer, no libraries) or CSV.

   Everything degrades gracefully: if a CDN library or WebGL is
   unavailable the page stays a fully readable, working document.
   ============================================================ */

(function () {
    "use strict";

    // ---------- environment ----------
    const config = window.WEDDING_CONFIG || {};
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const hasGSAP = typeof window.gsap !== "undefined";
    const hasScrollTrigger = hasGSAP && typeof window.ScrollTrigger !== "undefined";
    const hasLenis = typeof window.Lenis !== "undefined";

    if (hasScrollTrigger) gsap.registerPlugin(ScrollTrigger);

    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

    // ============================================================
    // INPUT SANITATION
    // ============================================================
    // Guest-typed text reaches four places that each read it differently:
    // the DOM (HTML), the .xlsx export (XML), the .csv export (formulas),
    // and the couple's Google Sheet (also formulas). Nothing is "sanitised
    // once and safe everywhere" — the rule here is *clean on the way in,
    // encode on the way out*, with the encoding chosen per destination.
    //
    // These functions are the "way in" half, and they are a convenience,
    // not the defence: anything running in this page can be edited from
    // devtools, so the copies in backend/google-apps-script/Code.gs are
    // what actually protect the guest list. Both are kept in step.

    const NAME_MAX = 120;    // matches clean_(body.name, 120) on the server
    const WISHES_MAX = 1000; // matches clean_(body.wishes, 1000)
    const GUESTS_MAX = 20;   // server clamp; the stepper's own cap is lower

    // C0/C1 controls, DEL, and the two Unicode line separators. A newline or
    // a tab smuggled into a name would split the row across cells in the CSV
    // export and across lines in the Sheet.
    const CTRL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
    // Bidirectional overrides. These re-order how everything after them is
    // drawn, so a name can be made to render as something other than what is
    // stored -- the dashboard, the exports and the Sheet would each show
    // text the data does not actually say.
    const BIDI_CHARS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
    // Zero-width and other invisible formatting characters: padding that
    // makes two different entries look identical on screen.
    const INVISIBLE_CHARS = /[\u00ad\u180e\u200b-\u200d\u2060\ufeff]/g;

    // The one place guest-typed text is cleaned. Order matters: normalise
    // first so that two spellings of the same accented name compare equal in
    // isSameGuest(), then strip what carries risk but no meaning.
    function sanitizeText(value, max) {
        let s = value == null ? "" : String(value);
        // bound the work before running five regexes over a pasted novel
        if (s.length > max * 4) s = s.slice(0, max * 4);
        if (s.normalize) s = s.normalize("NFC");
        return s
            .replace(CTRL_CHARS, " ")
            .replace(BIDI_CHARS, "")
            .replace(INVISIBLE_CHARS, "")
            .replace(/\s{2,}/g, " ")
            .trim()
            .slice(0, max);
    }

    // Phone: a plain 10-digit local number, no country code. Anything else the
    // guest types or pastes (spaces, dashes, brackets, a +91 prefix) is stripped;
    // when a pasted number carries a country code the last 10 digits are kept.
    function tenDigits(value) {
        const digits = String(value == null ? "" : value).replace(/\D/g, "");
        return digits.length > 10 ? digits.slice(-10) : digits;
    }

    // One RSVP, forced into the shape the rest of the page assumes: every
    // field present, every field the right type, every string sanitised.
    // Returns null for anything that cannot be made into a usable entry.
    //
    // Everything that is *read back* goes through this — localStorage (which
    // the guest and any script on this origin can rewrite) and the backend
    // response alike. Trusting the shape of stored data is how a value that
    // never passed the form ends up in an export.
    function normalizeEntry(raw) {
        if (!raw || typeof raw !== "object") return null;
        const name = sanitizeText(raw.name, NAME_MAX);
        if (!name) return null;
        const guests = parseInt(raw.guests, 10);
        return {
            name: name,
            phone: tenDigits(raw.phone),
            // a whitelist, not a cleanup: any value that is not exactly
            // "attending" is a decline
            attendance: raw.attendance === "attending" ? "attending" : "declined",
            guests: Math.min(Math.max(isNaN(guests) ? 0 : guests, 0), GUESTS_MAX),
            wishes: sanitizeText(raw.wishes, WISHES_MAX),
            timestamp: sanitizeText(raw.timestamp, 40)
        };
    }

    function normalizeEntries(list) {
        if (!Array.isArray(list)) return [];
        return list.map(normalizeEntry).filter(Boolean);
    }

    // The "way out" half, for the DOM. Every guest-supplied value that is
    // concatenated into an HTML string passes through this; the .xlsx and
    // .csv writers have their own encoders further down, for their own
    // syntaxes.
    function escapeHtml(unsafe) {
        if (unsafe == null || unsafe === "") return "";
        return String(unsafe)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ============================================================
    // RSVP STORAGE
    // ============================================================
    // Sample wishes, shown on the guestbook wall only while this device has
    // no real ones yet. They are DISPLAY ONLY and are never written to the
    // stored RSVP list — otherwise they would be counted as responses in
    // the guest-list dashboard, land in the Excel/CSV exports, and come
    // back every time the list is cleared.
    const DEMO_WISHES = [
        { name: "Vibhuti", phone: "", attendance: "attending", guests: 2, wishes: "Congratulations! We are so excited to see you two tie the knot. Wishing you a lifetime of love and happiness!", timestamp: "2026-07-08 14:32:00" },
        { name: "Annwin", phone: "", attendance: "attending", guests: 2, wishes: "So happy to be there to witness your vows. Wishing you every blessing.", timestamp: "2026-07-06 09:12:00" },
        { name: "Atulya", phone: "", attendance: "attending", guests: 1, wishes: "May your life together be filled with joy, adventure, and lots of laughter!", timestamp: "2026-07-05 18:45:00" }
    ];

    function getRSVPs() {
        try {
            const list = localStorage.getItem("wedding_rsvps");
            // Re-sanitised on the way out, not trusted because we wrote it:
            // this store is plain text the guest can edit, and it feeds the
            // wish wall, the dashboard's local mode and both exports.
            return normalizeEntries(list ? JSON.parse(list) : []);
        } catch (e) {
            return [];
        }
    }

    function saveRSVPs(list) {
        try {
            localStorage.setItem("wedding_rsvps", JSON.stringify(list));
            return true;
        } catch (e) {
            return false;
        }
    }

    // the same guest answering twice (a retry after a failed send, or a
    // change of heart) updates their entry rather than adding a second one
    function isSameGuest(a, b) {
        return String(a.phone || "") === String(b.phone || "") &&
            String(a.name || "").trim().toLowerCase() === String(b.name || "").trim().toLowerCase();
    }

    // ============================================================
    // BACKEND CLIENT (Google Apps Script web app — BACKEND_SETUP.md)
    // ============================================================
    function backendUrl() {
        const url = String(config.backendUrl || "").trim();
        return /^https:\/\//.test(url) ? url : "";
    }

    function backendPost(payload) {
        const controller = "AbortController" in window ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 15000) : null;
        return fetch(backendUrl(), {
            method: "POST",
            // text/plain keeps this a "simple" CORS request (no preflight),
            // which is the only kind Apps Script web apps can answer
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
            signal: controller ? controller.signal : undefined
        }).then(res => {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
        }).finally(() => {
            if (timer) clearTimeout(timer);
        });
    }

    function downloadBlob(blob, filename) {
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    }

    // ============================================================
    // CONTENT FROM CONFIG
    // ============================================================
    function populateContent() {
        const bindings = {
            initials: config.initials,
            groomName: config.groomName,
            brideName: config.brideName,
            weddingDateText: config.weddingDateText,
            rsvpDeadlineText: config.rsvpDeadlineText,
            cardInviteMsg: config.cardInviteMsg
        };
        $$("[data-bind]").forEach(el => {
            const val = bindings[el.getAttribute("data-bind")];
            if (val) el.textContent = val;
        });

        if (config.groomName) $("#hero-name-groom").textContent = config.groomName;
        if (config.brideName) $("#hero-name-bride").textContent = config.brideName;
        if (config.groomName && config.brideName) {
            const heroTitle = $(".hero-title");
            if (heroTitle) heroTitle.setAttribute("aria-label", config.brideName + " and " + config.groomName);
        }

        ["ceremony", "reception"].forEach(key => {
            const evt = config.events && config.events[key];
            if (!evt) return;
            const set = (id, val) => { const el = $("#" + key + "-" + id); if (el && val) el.textContent = val; };
            set("title", evt.title);
            set("venue", evt.venue);
            set("address", evt.address);
            const mapLink = $("#" + key + "-map-link");
            if (mapLink && evt.mapLink) mapLink.href = evt.mapLink;
            if (evt.startISO) {
                const d = new Date(evt.startISO);
                if (!isNaN(d)) {
                    set("time-short", d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
                    const clockEl = $("#" + key + "-time-short");
                    if (clockEl && clockEl.nextElementSibling) {
                        clockEl.nextElementSibling.textContent = d.toLocaleDateString("en-US", { weekday: "long" });
                    }
                }
            }
        });

        const formHint = $("#rsvp-form-hint");
        if (formHint && backendUrl()) {
            formHint.textContent = "Responses are delivered securely to the couple's guest list.";
        } else if (config.rsvpWebhookUrl) {
            const hint = $("#webhook-hint");
            if (hint) hint.textContent = " and delivered to the couple";
        }

        // marquee: two identical chunks so the -50% keyframe loops seamlessly
        const track = $("#marquee-track");
        if (track) {
            const names = (config.brideName || "Ann Sweety") + " & " + (config.groomName || "Maschio");
            const items = ["Save the date", config.weddingDateText || "September 24, 2026", names, "New Delhi", "<em>Celebrate with us</em>"];
            const chunkHTML = items.map(t => '<span class="marquee-item">' + t + '</span><span class="marquee-star">✦</span>').join("");
            track.innerHTML = '<div class="marquee-chunk">' + chunkHTML + '</div><div class="marquee-chunk">' + chunkHTML + '</div>';
        }
    }

    // ============================================================
    // FLOWING SILK + CHAMPAGNE DUST — WebGL
    // ============================================================
    // The whole scene is one fullscreen quad running a domain-warped fbm
    // shader, plus a few drifting points. That needs no scene graph, no
    // camera and no geometry pipeline, so it talks to the WebGL context
    // directly instead of pulling ~590 KB of Three.js onto the critical
    // path. Same output, and the page has one fewer CDN to depend on.
    const Silk = (() => {
        const canvas = $("#silk-canvas");
        if (!canvas) return { active: false };

        const GL_OPTS = {
            antialias: false, alpha: false, depth: false, stencil: false,
            preserveDrawingBuffer: false, powerPreference: "low-power"
        };
        let gl = null;
        try {
            gl = canvas.getContext("webgl", GL_OPTS) || canvas.getContext("experimental-webgl", GL_OPTS);
        } catch (e) { /* WebGL blocked or unavailable */ }
        if (!gl) {
            canvas.style.display = "none";
            return { active: false };
        }

        function compile(type, src) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        }

        function link(vertSrc, fragSrc) {
            const vs = compile(gl.VERTEX_SHADER, vertSrc);
            const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
            if (!vs || !fs) return null;
            const prog = gl.createProgram();
            gl.attachShader(prog, vs);
            gl.attachShader(prog, fs);
            gl.linkProgram(prog);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null;
        }

        const silkProgram = link(
            "attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }",
            [
                "precision highp float;",
                "uniform float uTime;",
                "uniform vec2 uRes;",
                "uniform vec2 uMouse;",
                "",
                "float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }",
                "float noise(vec2 p){",
                "  vec2 i = floor(p); vec2 f = fract(p);",
                "  vec2 u = f * f * (3.0 - 2.0 * f);",
                "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),",
                "             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);",
                "}",
                "float fbm(vec2 p){",
                "  float v = 0.0; float a = 0.5;",
                "  for(int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.55; }",
                "  return v;",
                "}",
                "",
                "void main(){",
                "  vec2 uv = gl_FragCoord.xy / uRes;",
                "  vec2 p = uv; p.x *= uRes.x / uRes.y;",
                "  float t = uTime * 0.045;",
                "",
                "  // domain-warped fbm = slow folds of silk",
                "  vec2 q = vec2(fbm(p * 1.6 + t), fbm(p * 1.6 - t * 0.7));",
                "  vec2 m = (uMouse - 0.5) * 0.35;",
                "  float f = fbm(p * 2.1 + q * 1.4 + m + vec2(t * 0.5, -t * 0.3));",
                "",
                "  // warm gold paper -> deeper amber folds -> vivid champagne sheen",
                "  vec3 paper    = vec3(0.973, 0.918, 0.816);",
                "  vec3 fold     = vec3(0.906, 0.792, 0.565);",
                "  vec3 blush    = vec3(0.945, 0.812, 0.612);",
                "  vec3 champagne= vec3(0.878, 0.635, 0.180);",
                "",
                "  vec3 col = mix(paper, fold, smoothstep(0.25, 0.75, f));",
                "  col = mix(col, blush, smoothstep(0.55, 0.95, fbm(p * 1.3 - q + t)) * 0.42);",
                "  float sheen = pow(smoothstep(0.45, 0.85, f), 3.0);",
                "  col = mix(col, champagne, sheen * 0.6);",
                "",
                "  // vignette keeps the type legible",
                "  float vig = smoothstep(1.25, 0.35, distance(uv, vec2(0.5, 0.52)));",
                "  col = mix(col * 0.985, col, vig);",
                "",
                "  // film grain",
                "  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.028;",
                "  gl_FragColor = vec4(col, 1.0);",
                "}"
            ].join("\n")
        );

        // The dust sprite was a 64px canvas holding a radial gradient; the
        // same falloff is two mix() calls here, so there is no texture to
        // upload and no second canvas to keep alive.
        const dustProgram = link(
            [
                "attribute vec2 aDust;",
                "uniform float uSize;",
                "void main(){ gl_Position = vec4(aDust, 0.0, 1.0); gl_PointSize = uSize; }"
            ].join("\n"),
            [
                "precision mediump float;",
                "void main(){",
                "  float r = length(gl_PointCoord - 0.5) * 2.0;",
                "  float a = r < 0.4 ? mix(0.9, 0.28, r / 0.4) : mix(0.28, 0.0, (r - 0.4) / 0.6);",
                "  gl_FragColor = vec4(0.690, 0.541, 0.314, a * 0.55);",
                "}"
            ].join("\n")
        );

        if (!silkProgram) {
            canvas.style.display = "none";
            return { active: false };
        }

        // fullscreen quad as a triangle strip — no index buffer needed
        const quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const aPos = gl.getAttribLocation(silkProgram, "aPos");
        const uTime = gl.getUniformLocation(silkProgram, "uTime");
        const uRes = gl.getUniformLocation(silkProgram, "uRes");
        const uMouse = gl.getUniformLocation(silkProgram, "uMouse");

        // drifting champagne dust
        const DUST = 110;
        const positions = new Float32Array(DUST * 2);
        const speeds = new Float32Array(DUST);
        for (let i = 0; i < DUST; i++) {
            positions[i * 2] = Math.random() * 2 - 1;
            positions[i * 2 + 1] = Math.random() * 2 - 1;
            speeds[i] = 0.02 + Math.random() * 0.06;
        }
        const dustBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, dustBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
        const aDust = dustProgram ? gl.getAttribLocation(dustProgram, "aDust") : -1;
        const uSize = dustProgram ? gl.getUniformLocation(dustProgram, "uSize") : null;

        let mouseX = 0.5, mouseY = 0.5;
        let resWidth = 1, resHeight = 1;
        let pixelRatio = 1;
        let time = 0;

        function draw() {
            gl.useProgram(silkProgram);
            gl.uniform1f(uTime, time);
            gl.uniform2f(uRes, resWidth, resHeight);
            gl.uniform2f(uMouse, mouseX, mouseY);
            gl.disable(gl.BLEND);
            gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            if (!dustProgram) return;
            gl.useProgram(dustProgram);
            gl.uniform1f(uSize, pixelRatio);
            gl.enable(gl.BLEND);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.bindBuffer(gl.ARRAY_BUFFER, dustBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, positions);
            gl.enableVertexAttribArray(aDust);
            gl.vertexAttribPointer(aDust, 2, gl.FLOAT, false, 0, 0);
            gl.drawArrays(gl.POINTS, 0, DUST);
        }

        function resize() {
            // The shader is fragment-bound (four 5-octave fbm evaluations per
            // pixel), so the pixel ratio is capped well below the screen's on
            // phones. It draws a soft, out-of-focus gradient — the lost
            // sharpness is invisible, and it roughly halves the pixels shaded.
            const cap = window.innerWidth < 768 ? 1.25 : 1.5;
            const dpr = Math.min(window.devicePixelRatio || 1, cap);
            const w = Math.max(1, Math.floor(window.innerWidth * dpr));
            const h = Math.max(1, Math.floor(window.innerHeight * dpr));
            pixelRatio = dpr;
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
            gl.viewport(0, 0, w, h);
            resWidth = w;
            resHeight = h;
            if (reducedMotion) draw();
        }
        resize();
        // Debounced: on mobile the browser fires resize for every chrome
        // collapse and every soft-keyboard open, and reallocating the drawing
        // buffer each time is visibly janky. A keyboard opening changes only
        // the height, so skip those while a field is focused — the blur that
        // closes the keyboard fires resize again and re-syncs.
        let resizeTimer = null;
        let lastWidth = window.innerWidth;
        window.addEventListener("resize", () => {
            const typing = document.activeElement &&
                /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
            if (window.innerWidth === lastWidth && typing) return;
            lastWidth = window.innerWidth;
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(resize, 180);
        });

        const mouseTarget = { x: 0.5, y: 0.5 };
        if (finePointer && !reducedMotion) {
            window.addEventListener("mousemove", (e) => {
                mouseTarget.x = e.clientX / window.innerWidth;
                mouseTarget.y = 1 - e.clientY / window.innerHeight;
            }, { passive: true });
        }

        // A lost context (GPU reset, tab backgrounded on mobile) leaves every
        // buffer and program invalid. Preventing the default keeps the canvas
        // from going permanently black; the loop idles until it is restored.
        let contextLost = false;
        canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); contextLost = true; }, false);

        // only render while the canvas can actually be seen (hero / footer)
        let heroVisible = true, footerVisible = false, pageVisible = true;
        const io = new IntersectionObserver((entries) => {
            entries.forEach(en => {
                if (en.target.id === "hero") heroVisible = en.isIntersecting;
                else footerVisible = en.isIntersecting;
            });
        }, { threshold: 0 });
        const heroEl = $("#hero"), footerEl = $(".footer");
        if (heroEl) io.observe(heroEl);
        if (footerEl) io.observe(footerEl);
        document.addEventListener("visibilitychange", () => { pageVisible = !document.hidden; });

        let lastFrame = 0;

        function frame(now) {
            requestAnimationFrame(frame);
            if (contextLost || !pageVisible || (!heroVisible && !footerVisible)) {
                lastFrame = now; // don't bank the paused time into one huge step
                return;
            }
            const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
            lastFrame = now;
            time += dt;
            mouseX += (mouseTarget.x - mouseX) * 0.04;
            mouseY += (mouseTarget.y - mouseY) * 0.04;

            for (let i = 0; i < DUST; i++) {
                positions[i * 2 + 1] += speeds[i] * dt;
                positions[i * 2] += Math.sin(time * 0.4 + i) * 0.00016;
                if (positions[i * 2 + 1] > 1.05) {
                    positions[i * 2 + 1] = -1.05;
                    positions[i * 2] = Math.random() * 2 - 1;
                }
            }

            draw();
        }

        if (reducedMotion) {
            time = 12;
            draw();
        } else {
            requestAnimationFrame(frame);
        }

        return { active: true };
    })();

    // ============================================================
    // LENIS SMOOTH SCROLL
    // ============================================================
    let lenis = null;
    if (hasLenis && hasGSAP && !reducedMotion) {
        lenis = new Lenis({ duration: 1.15, smoothWheel: true });
        lenis.on("scroll", () => { if (hasScrollTrigger) ScrollTrigger.update(); });
        gsap.ticker.add((time) => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
    }

    // Locking the page behind an overlay. `overflow: hidden` on <body> alone is
    // not a reliable lock on iOS Safari — the page still rubber-bands and often
    // loses its position — so the body is pinned with position: fixed at a
    // negative offset and restored to the same place on unlock. Nested lock
    // requests are counted, since the preloader can still be locked when a
    // modal opens.
    let scrollLockDepth = 0;
    let lockedScrollY = 0;
    function scrollLock(lock) {
        const body = document.body;
        if (lock) {
            if (scrollLockDepth++ > 0) return;
            lockedScrollY = window.scrollY || window.pageYOffset || 0;
            body.style.top = "-" + lockedScrollY + "px";
            body.classList.add("no-scroll");
            if (lenis) lenis.stop();
        } else {
            if (scrollLockDepth === 0 || --scrollLockDepth > 0) return;
            body.classList.remove("no-scroll");
            body.style.top = "";
            // instant, not the page's smooth behaviour: this is restoring where
            // the guest already was, not a navigation
            window.scrollTo({ top: lockedScrollY, behavior: "auto" });
            if (lenis) lenis.start();
        }
    }

    // anchor links glide via Lenis
    $$('a[href^="#"]').forEach(a => {
        a.addEventListener("click", (e) => {
            const href = a.getAttribute("href");
            if (href.length < 2) { e.preventDefault(); return; } // bare "#" placeholders
            const target = $(href);
            if (!target) return;
            e.preventDefault();
            closeMenu();
            if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.4 });
            else target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
        });
    });

    // ============================================================
    // TEXT SPLITTING
    // ============================================================
    function splitChars(el) {
        const text = el.textContent;
        el.textContent = "";
        const chars = [];
        for (const ch of text) {
            const mask = document.createElement("span");
            mask.className = "char-mask";
            const span = document.createElement("span");
            span.className = "char";
            span.textContent = ch === " " ? "\u00A0" : ch;
            mask.appendChild(span);
            el.appendChild(mask);
            chars.push(span);
        }
        return chars;
    }

    function wrapLines(container) {
        return $$(".dt-line", container).map(line => {
            const inner = document.createElement("span");
            inner.className = "dt-inner";
            while (line.firstChild) inner.appendChild(line.firstChild);
            line.appendChild(inner);
            return inner;
        });
    }

    // ============================================================
    // PRELOADER + HERO INTRO
    // ============================================================
    const preloader = $("#preloader");
    const heroChars = [];

    function buildHero() {
        $$("[data-split]").forEach(el => heroChars.push(...splitChars(el)));
    }

    function heroIntro() {
        if (!hasGSAP || reducedMotion) return;
        const tl = gsap.timeline({ delay: 0.05 });
        tl.to(heroChars, {
            yPercent: 0,
            duration: 1.3,
            ease: "power4.out",
            stagger: { each: 0.035, from: "random" }
        }, 0);
        tl.to(".reveal-hero", {
            opacity: 1,
            y: 0,
            duration: 1.1,
            ease: "power3.out",
            stagger: 0.09
        }, 0.45);
    }

    function dismissPreloader() {
        if (!preloader) return;
        if (!hasGSAP || reducedMotion) {
            preloader.style.display = "none";
            scrollLock(false);
            heroIntro();
            return;
        }
        const tl = gsap.timeline({
            onComplete: () => {
                preloader.style.display = "none";
                scrollLock(false);
            }
        });
        tl.to(".preloader-center", { opacity: 0, y: -30, duration: 0.55, ease: "power2.in" })
            .to(".curtain-b", { scaleY: 1, transformOrigin: "bottom", duration: 0.7, ease: "power4.inOut" }, "-=0.15")
            .to(".curtain-a", { yPercent: -100, duration: 0.9, ease: "power4.inOut" }, "-=0.35")
            .to(".curtain-b", { yPercent: -100, duration: 0.9, ease: "power4.inOut" }, "-=0.75")
            .add(heroIntro, "-=0.85");
    }

    function runPreloader() {
        scrollLock(true);

        if (hasGSAP && !reducedMotion) {
            // hide everything the intro will reveal
            gsap.set(heroChars, { yPercent: 110 });
            gsap.set(".reveal-hero", { opacity: 0, y: 24 });
        }

        if (!hasGSAP || reducedMotion) {
            dismissPreloader();
            return;
        }

        const numEl = $("#preloader-num");
        const counter = { v: 0 };
        let pageLoaded = document.readyState === "complete";
        window.addEventListener("load", () => { pageLoaded = true; });

        gsap.to(counter, {
            v: 99,
            duration: 1.5,
            ease: "power2.inOut",
            onUpdate: () => { numEl.textContent = Math.round(counter.v); },
            onComplete: waitForLoad
        });

        const started = performance.now();
        function waitForLoad() {
            // hold at 99 until the page load event, but never longer than 2s more
            if (pageLoaded || performance.now() - started > 3500) {
                numEl.textContent = "100";
                dismissPreloader();
            } else {
                setTimeout(waitForLoad, 120);
            }
        }
    }

    // ============================================================
    // SCROLL REVEALS
    // ============================================================
    function initReveals() {
        if (!hasScrollTrigger || reducedMotion) return;

        $$("[data-reveal]").forEach(el => {
            gsap.fromTo(el,
                { opacity: 0, y: 36 },
                {
                    opacity: 1, y: 0, duration: 1.1, ease: "power3.out",
                    scrollTrigger: { trigger: el, start: "top 88%", once: true }
                });
        });

        $$("[data-reveal-lines]").forEach(container => {
            const inners = wrapLines(container);
            const accents = $$("em", container);
            gsap.fromTo(inners,
                { yPercent: 110 },
                {
                    yPercent: 0, duration: 1.2, ease: "power4.out", stagger: 0.12,
                    scrollTrigger: {
                        trigger: container, start: "top 86%", once: true,
                        onEnter: () => runSheen(accents, 0.55)
                    }
                });
        });
    }

    // Replay the gold sheen sweep across accent words once they've revealed.
    function runSheen(accents, delay) {
        if (!accents || !accents.length || reducedMotion) return;
        gsap.delayedCall(delay || 0, () => {
            accents.forEach(em => {
                em.classList.remove("sheen-run");
                void em.offsetWidth; // restart the CSS animation
                em.classList.add("sheen-run");
            });
        });
    }

    // ============================================================
    // COUNTDOWN
    // ============================================================
    function initCountdown() {
        const els = {
            days: $("#cd-days"), hours: $("#cd-hours"),
            minutes: $("#cd-minutes"), seconds: $("#cd-seconds")
        };
        if (!els.days) return;
        const target = new Date(config.countdownTarget || "2026-09-24T16:00:00+05:30").getTime();

        function setVal(el, val, pad) {
            const str = String(val).padStart(pad, "0");
            if (el.textContent === str) return;
            el.textContent = str;
            if (hasGSAP && !reducedMotion) {
                gsap.fromTo(el, { opacity: 0.35, y: 6 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out", overwrite: true });
            }
        }

        function tick() {
            const diff = target - Date.now();
            if (diff <= 0) {
                setVal(els.days, 0, 2); setVal(els.hours, 0, 2);
                setVal(els.minutes, 0, 2); setVal(els.seconds, 0, 2);
                const note = $(".countdown-note");
                if (note) note.textContent = "The day has arrived — with love, " + (config.initials || "A & M");
                return;
            }
            setVal(els.days, Math.floor(diff / 86400000), 2);
            setVal(els.hours, Math.floor(diff / 3600000) % 24, 2);
            setVal(els.minutes, Math.floor(diff / 60000) % 60, 2);
            setVal(els.seconds, Math.floor(diff / 1000) % 60, 2);
            setTimeout(tick, 1000);
        }
        tick();
    }

    // ============================================================
    // RSVP FORM
    // ============================================================
    const rsvpForm = $("#rsvp-form");
    const detailsBlock = $("#rsvp-details");
    const guestValue = $("#guest-count-value");
    let guestCount = 1;
    const GUEST_MAX = 10;

    function refreshStepper() {
        guestValue.textContent = String(guestCount);
        $("#guest-minus").disabled = guestCount <= 1;
        $("#guest-plus").disabled = guestCount >= GUEST_MAX;
    }

    $("#guest-minus").addEventListener("click", () => { guestCount = Math.max(1, guestCount - 1); refreshStepper(); });
    $("#guest-plus").addEventListener("click", () => { guestCount = Math.min(GUEST_MAX, guestCount + 1); refreshStepper(); });
    refreshStepper();

    // Stripped as the guest types, with tenDigits() from the sanitation
    // block above, so the field only ever holds what will be submitted.
    const phoneInput = $("#guest-phone");

    phoneInput.addEventListener("input", () => {
        const cleaned = tenDigits(phoneInput.value);
        if (cleaned !== phoneInput.value) phoneInput.value = cleaned;
    });

    // A custom validity message sticks until it is cleared, which would keep
    // the form permanently un-submittable once the name check has fired.
    $("#guest-name").addEventListener("input", (event) => {
        event.target.setCustomValidity("");
    });

    // Collapsing is a max-height/opacity transition, so the guest stepper is
    // still in the tab order (and readable by screen readers) while it looks
    // gone. `inert` takes the whole block out until it is shown again.
    function collapseDetails(collapsed) {
        detailsBlock.classList.toggle("collapsed", collapsed);
        detailsBlock.inert = collapsed;
    }

    $$('input[name="attendance"]', rsvpForm).forEach(radio => {
        radio.addEventListener("change", () => {
            collapseDetails(radio.value === "declined" && radio.checked);
        });
    });

    function launchConfetti(originEl) {
        if (!hasGSAP || reducedMotion) return;
        const rect = originEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const colors = ["#cf8a0e", "#eab13c", "#f8ead0", "#e0a828", "#a5620a"];
        for (let i = 0; i < 56; i++) {
            const piece = document.createElement("span");
            piece.className = "confetti-piece";
            const size = 5 + Math.random() * 7;
            piece.style.width = size + "px";
            piece.style.height = size * (Math.random() > 0.5 ? 1 : 0.4) + "px";
            piece.style.background = colors[i % colors.length];
            piece.style.left = cx + "px";
            piece.style.top = cy + "px";
            document.body.appendChild(piece);
            const angle = Math.random() * Math.PI * 2;
            const velocity = 120 + Math.random() * 260;
            gsap.to(piece, {
                x: Math.cos(angle) * velocity,
                y: Math.sin(angle) * velocity - 160 + Math.random() * 80,
                rotation: Math.random() * 540 - 270,
                duration: 0.7,
                ease: "power2.out",
                onComplete: () => {
                    gsap.to(piece, {
                        y: "+=" + (300 + Math.random() * 240),
                        opacity: 0,
                        rotation: "+=" + (Math.random() * 360 - 180),
                        duration: 1.1 + Math.random() * 0.6,
                        ease: "power1.in",
                        onComplete: () => piece.remove()
                    });
                }
            });
        }
    }

    let rsvpSending = false;

    rsvpForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (rsvpSending) return;
        // autofill can drop a formatted number in without firing "input"
        phoneInput.value = tenDigits(phoneInput.value);
        if (!rsvpForm.reportValidity()) return;

        const nameInput = $("#guest-name");
        const wishesInput = $("#wishes");
        const name = sanitizeText(nameInput.value, NAME_MAX);
        const phone = tenDigits(phoneInput.value);
        const attendance = $('input[name="attendance"]:checked', rsvpForm).value === "attending"
            ? "attending" : "declined";
        const wishes = sanitizeText(wishesInput.value, WISHES_MAX);

        // Show the guest what is actually going to be sent, rather than
        // silently submitting something different from what is on screen.
        if (nameInput.value !== name) nameInput.value = name;
        if (wishesInput.value !== wishes) wishesInput.value = wishes;

        // required + pattern already passed, so a failure here means the
        // field held only characters sanitation removes. Say so instead of
        // returning to a form that looks like nothing happened.
        if (!name) {
            nameInput.setCustomValidity("Please enter your name using letters or numbers.");
            nameInput.reportValidity();
            return;
        }
        if (phone.length !== 10) return;

        const now = new Date();
        const two = (n) => String(n).padStart(2, "0");
        const timestamp = now.getFullYear() + "-" + two(now.getMonth() + 1) + "-" + two(now.getDate()) +
            " " + two(now.getHours()) + ":" + two(now.getMinutes()) + ":" + two(now.getSeconds());

        const entry = {
            name, phone, attendance,
            guests: attendance === "attending" ? guestCount : 0,
            wishes, timestamp
        };

        // always keep a copy on this device (drives the wish wall + local mode)
        const list = getRSVPs().filter(r => !isSameGuest(r, entry));
        list.push(entry);
        const saved = saveRSVPs(list);

        // optional generic webhook copy (notification services etc.)
        if (config.rsvpWebhookUrl) {
            fetch(config.rsvpWebhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(entry)
            }).catch(() => { /* non-blocking: still saved locally */ });
        }

        const finishSubmit = (delivered) => {
            renderWishes();
            launchConfetti($(".rsvp-submit"));

            const msg = $("#rsvp-success-msg");
            if (delivered === "list_full") {
                msg.textContent = name + ", the guest list is not accepting any more entries, so your RSVP is saved on this device only. Please reach out to us directly so we can add you.";
            } else if (delivered === "failed") {
                msg.textContent = name + ", we couldn't reach the guest list right now, so your RSVP is saved on this device only. Please try again in a little while, or reach out to us directly.";
            } else if (!saved && delivered !== "delivered") {
                msg.textContent = name + ", we couldn't save your RSVP on this device (your browser may be blocking storage). Please try again or reach out to us directly.";
            } else if (attendance === "attending") {
                msg.textContent = name + ", your acceptance has been joyfully received. We can't wait to celebrate with you!";
            } else {
                msg.textContent = name + ", thank you for letting us know. You will be missed, but we treasure your warm thoughts.";
            }
            openModal($("#rsvp-modal"));

            rsvpForm.reset();
            guestCount = 1;
            refreshStepper();
            collapseDetails(false);
        };

        if (!backendUrl()) {
            finishSubmit("local");
            return;
        }

        // deliver to the couple's Google Sheet, with a visible sending state
        const submitBtn = $(".rsvp-submit");
        const submitLabel = $(".rsvp-submit-label");
        const restore = () => {
            rsvpSending = false;
            submitBtn.disabled = false;
            submitLabel.textContent = "Send my answer";
        };
        rsvpSending = true;
        submitBtn.disabled = true;
        submitLabel.textContent = "Sending…";

        backendPost({ action: "rsvp", name: entry.name, phone: entry.phone, attendance: entry.attendance, guests: entry.guests, wishes: entry.wishes, timestamp: entry.timestamp })
            .then(data => {
                restore();
                if (data && data.ok) return finishSubmit("delivered");
                finishSubmit(data && data.error === "list_full" ? "list_full" : "failed");
            })
            .catch(() => {
                restore();
                finishSubmit("failed");
            });
    });

    // ============================================================
    // GUESTBOOK WALL
    // ============================================================
    function renderWishes() {
        const wall = $("#wish-wall");
        if (!wall) return;
        // real wishes from this device first; the samples stand in only
        // while there are none (they are never part of the guest list)
        const own = getRSVPs().filter(r => r.wishes && r.wishes.trim()).reverse();
        const entries = own.length ? own : DEMO_WISHES;
        if (entries.length === 0) {
            wall.innerHTML = '<p class="wish-empty">Be the first to leave the couple a wish — send yours with your RSVP.</p>';
            return;
        }
        wall.innerHTML = entries.map(entry => {
            const date = (entry.timestamp || "").split(" ")[0];
            return '<article class="wish-card">' +
                '<p class="wish-quote">&ldquo;' + escapeHtml(entry.wishes) + '&rdquo;</p>' +
                '<p class="wish-author">' + escapeHtml(entry.name) + '</p>' +
                (date ? '<p class="wish-date">' + escapeHtml(date) + '</p>' : "") +
                '</article>';
        }).join("");
    }

    // ============================================================
    // MODALS
    // ============================================================
    let lastFocused = null;

    function openModal(modal) {
        lastFocused = document.activeElement;
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        scrollLock(true);
        // deferred: the overlay is still visibility:hidden in the frame the
        // class lands, and focus() on a hidden element is silently refused
        setTimeout(() => {
            let focusable = $("[data-autofocus]", modal);
            if (focusable && focusable.offsetParent === null) focusable = null; // hidden
            if (!focusable) focusable = $("button, a, input, [tabindex]", modal);
            if (focusable) focusable.focus();
        }, 60);
    }

    function closeModal(modal) {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
        scrollLock(false);
        if (lastFocused) lastFocused.focus();
    }

    $("#rsvp-modal-close").addEventListener("click", () => closeModal($("#rsvp-modal")));
    $$(".modal").forEach(modal => {
        modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(modal); });
    });

    // ============================================================
    // MAP — hand the embed its gestures only once asked
    // ============================================================
    (function initMapShim() {
        const shim = $("#map-shim");
        if (!shim) return;
        shim.addEventListener("click", () => {
            shim.closest(".map-embed").classList.add("map-active");
        });
    })();

    // ============================================================
    // ADD TO CALENDAR (.ics download)
    // ============================================================
    // iPadOS reports itself as a Mac, so the touch check catches it too
    function isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    }

    function escapeICSText(text) {
        return String(text || "")
            .replace(/\\/g, "\\\\")
            .replace(/;/g, "\\;")
            .replace(/,/g, "\\,")
            .replace(/\r?\n/g, "\\n");
    }

    function addToCalendar(type) {
        const evt = config.events && config.events[type];
        if (!evt) return;

        const title = (config.brideName || "") + " and " + (config.groomName || "") + " — " + evt.title;
        // "2026-09-24T16:00:00" -> "20260924T160000" (floating venue-local
        // time; slice guards against a stray UTC offset in the config value)
        const startDate = evt.startISO.replace(/[-:]/g, "").slice(0, 15);
        const endDate = evt.endISO.replace(/[-:]/g, "").slice(0, 15);

        const ics = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Wedding Invitation//NONSGML v1.0//EN",
            "BEGIN:VEVENT",
            "UID:" + type + "-" + startDate + "-wedding-rsvp",
            "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z",
            "DTSTART:" + startDate,
            "DTEND:" + endDate,
            "SUMMARY:" + escapeICSText(title),
            "DESCRIPTION:" + escapeICSText("Please join us to celebrate our wedding!"),
            "LOCATION:" + escapeICSText(evt.address),
            "END:VEVENT",
            "END:VCALENDAR"
        ].join("\r\n");

        // iOS Safari ignores the download attribute on a blob URL: the .ics is
        // saved to Files instead of reaching Calendar, so the button looks
        // broken. Send those guests to a Google Calendar template instead,
        // which opens the event ready to save on any device.
        if (isIOS()) {
            const gcal = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
                "&text=" + encodeURIComponent(title) +
                "&dates=" + startDate + "/" + endDate +
                // the venue's zone — the event times in config.js are local
                // wall-clock times at the Cathedral, with no offset of their own
                "&ctz=Asia/Kolkata" +
                "&details=" + encodeURIComponent("Please join us to celebrate our wedding!") +
                "&location=" + encodeURIComponent(evt.address || "");
            window.open(gcal, "_blank", "noopener");
            return;
        }

        const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = type + "_event.ics";
        document.body.appendChild(link);
        link.click();
        link.remove();
        // the blob is retained until revoked; give the click a moment to start
        setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    }

    // Bound here rather than with an inline onclick="…" attribute, so the
    // page needs no script-src exception for inline handlers.
    $$("[data-calendar]").forEach(btn => {
        btn.addEventListener("click", () => addToCalendar(btn.getAttribute("data-calendar")));
    });

    // ============================================================
    // ADMIN DASHBOARD (passcode-protected guest list)
    //
    // The passcode is sent to the Google Apps Script backend, verified on
    // Google's servers, and the full guest list (all guests, all devices)
    // comes back with it. Nothing here can authorise anyone on its own:
    // with no backendUrl configured the dashboard simply stays locked,
    // because a passcode checked in the visitor's own browser — against a
    // value shipped in the page — protects nothing.
    // ============================================================
    const adminModal = $("#admin-modal");
    const adminLockForm = $("#admin-lock");
    const adminLockError = $("#admin-lock-error");
    const adminPasscodeInput = $("#admin-passcode");
    const adminUnlockBtn = $("#admin-unlock-btn");
    const adminDashboard = $("#admin-dashboard");
    const adminSource = $("#admin-source");
    const adminRefreshBtn = $("#admin-refresh-btn");
    const clearBtn = $("#clear-rsvps-btn");
    const rsvpTableBody = $("#rsvp-table-body");

    let adminUnlocked = false;   // survives modal close, resets on page reload
    let adminKey = "";           // passcode kept in memory only, for refreshes
    let adminData = [];          // the rows currently shown (drives exports)
    let adminDataSource = "local"; // "server" or "local" — set by renderAdmin

    const ADMIN_COLUMNS = ["Guest Name", "Phone Number", "Attending", "Guests", "Wishes", "Timestamp"];

    // one RSVP object → one flat export row (shared by Excel and CSV)
    function adminRow(r) {
        const attending = r.attendance === "attending";
        return [
            r.name, r.phone || "",
            attending ? "Yes" : "No",
            attending ? (parseInt(r.guests, 10) || 0) : 0,
            r.wishes || "", r.timestamp || ""
        ];
    }

    $("#admin-trigger").addEventListener("click", () => {
        if (adminUnlocked) {
            // reopening must show current data, not whatever was on screen at
            // unlock time. Unlocking only ever happens against the backend,
            // so there is always somewhere to re-read from.
            refreshAdminData();
            showAdminDashboard();
        } else {
            showAdminLock();
        }
        openModal(adminModal);
    });

    $("#admin-close").addEventListener("click", () => closeModal(adminModal));

    function showAdminLock() {
        adminLockForm.hidden = false;
        adminDashboard.hidden = true;
        adminLockError.hidden = true;
        adminPasscodeInput.value = "";
        hideClearConfirm();
    }

    function showAdminDashboard() {
        adminLockForm.hidden = true;
        adminDashboard.hidden = false;
        hideClearConfirm();
    }

    function setLockBusy(busy) {
        adminUnlockBtn.disabled = busy;
        adminUnlockBtn.textContent = busy ? "Checking…" : "Unlock";
    }

    function lockFail(message) {
        adminLockError.textContent = message;
        adminLockError.hidden = false;
        adminPasscodeInput.select();
    }

    adminLockForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const code = adminPasscodeInput.value;
        if (!code) {
            lockFail("Please enter the passcode.");
            return;
        }

        if (!backendUrl()) {
            // No backend, so there is nothing that can check a passcode
            // anywhere but in this browser — where the guest controls both
            // the code and the check. Refuse rather than pretend.
            lockFail("The guest list isn't connected yet. See BACKEND_SETUP.md.");
            return;
        }

        setLockBusy(true);
        backendPost({ action: "list", passcode: code })
            .then(data => {
                setLockBusy(false);
                if (data && data.ok) {
                    adminUnlocked = true;
                    adminKey = code;
                    renderAdmin(normalizeEntries(data.entries), "server");
                    showAdminDashboard();
                } else if (data && data.error === "unauthorized") {
                    lockFail("Incorrect passcode.");
                } else {
                    lockFail("The guest-list service returned an error. Please try again.");
                }
            })
            .catch(() => {
                setLockBusy(false);
                lockFail("Couldn't reach the guest-list service. Check your connection and try again.");
            });
    });

    function refreshAdminData() {
        if (!backendUrl() || !adminKey) return;
        adminRefreshBtn.disabled = true;
        backendPost({ action: "list", passcode: adminKey })
            .then(data => {
                adminRefreshBtn.disabled = false;
                if (data && data.ok) {
                    renderAdmin(normalizeEntries(data.entries), "server");
                } else if (data && data.error === "unauthorized") {
                    // passcode was changed on the server: lock again
                    adminUnlocked = false;
                    adminKey = "";
                    showAdminLock();
                    lockFail("The passcode has changed. Please enter the new one.");
                }
            })
            .catch(() => { adminRefreshBtn.disabled = false; });
    }

    adminRefreshBtn.addEventListener("click", refreshAdminData);

    // `list` is expected to be already-normalised entries — normalizeEntries
    // runs at the two points data enters (the backend response, and getRSVPs
    // reading localStorage), not here.
    function renderAdmin(list, source) {
        adminData = Array.isArray(list) ? list : [];

        if (source === "server") {
            adminSource.textContent = "Live · synced from your Google Sheet";
            adminSource.classList.add("live");
            adminRefreshBtn.hidden = false;
        } else {
            adminSource.textContent = "This device only — see BACKEND_SETUP.md for the full guest list";
            adminSource.classList.remove("live");
            adminRefreshBtn.hidden = true;
        }
        adminDataSource = source;

        const attending = adminData.filter(r => r.attendance === "attending");
        const totalGuests = attending.reduce((sum, r) => sum + (parseInt(r.guests, 10) || 0), 0);

        $("#admin-stats").innerHTML = [
            { num: adminData.length, label: "Responses" },
            { num: attending.length, label: "Accepted" },
            { num: totalGuests, label: "Total guests" },
            { num: adminData.length - attending.length, label: "Declined" }
        ].map(s => '<div class="stat-tile"><p class="stat-num">' + s.num + '</p><p class="stat-label">' + s.label + '</p></div>').join("");

        if (adminData.length === 0) {
            rsvpTableBody.innerHTML = '<tr class="empty-row"><td colspan="6">No RSVPs yet.</td></tr>';
            return;
        }
        // data-label mirrors the <thead> headings. On phones the table is
        // restyled into stacked cards and the header row is hidden, so CSS
        // reads these back out via content: attr(data-label) to keep every
        // value labelled. They are fixed strings, never guest input.
        rsvpTableBody.innerHTML = adminData.map(entry => {
            const attendingRow = entry.attendance === "attending";
            return "<tr>" +
                '<td data-label="Guest"><strong>' + escapeHtml(entry.name) + "</strong></td>" +
                '<td data-label="Phone">' + escapeHtml(entry.phone) + "</td>" +
                '<td data-label="Attending"><span class="pill ' + (attendingRow ? "yes" : "no") + '">' + (attendingRow ? "Yes" : "No") + "</span></td>" +
                '<td data-label="Guests">' + (attendingRow ? (parseInt(entry.guests, 10) || 0) : "0") + "</td>" +
                '<td class="wish-cell" data-label="Wishes">' + (escapeHtml(entry.wishes) || "—") + "</td>" +
                '<td data-label="When">' + escapeHtml(entry.timestamp || "") + "</td>" +
                "</tr>";
        }).join("");
    }

    // ---- Export: Excel (.xlsx) — built-in writer, no libraries ----
    // Produces a genuine Office Open XML workbook: a ZIP archive (STORE
    // method, no compression needed) holding the minimal part set. Text
    // goes in as inline strings, so guest-typed content can never be
    // interpreted as a formula.
    const XlsxWriter = (() => {
        const te = new TextEncoder();

        const CRC_TABLE = (() => {
            const t = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                t[n] = c >>> 0;
            }
            return t;
        })();

        function crc32(bytes) {
            let c = 0xFFFFFFFF;
            for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
            return (c ^ 0xFFFFFFFF) >>> 0;
        }

        function zip(files) {
            const chunks = [];
            const central = [];
            let offset = 0;
            const now = new Date();
            const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
            const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

            files.forEach(f => {
                const nameBytes = te.encode(f.name);
                const data = te.encode(f.text);
                const crc = crc32(data);

                const local = new DataView(new ArrayBuffer(30));
                local.setUint32(0, 0x04034b50, true);  // local file header
                local.setUint16(4, 20, true);          // version needed
                local.setUint16(6, 0x0800, true);      // UTF-8 names
                local.setUint16(8, 0, true);           // method: store
                local.setUint16(10, dosTime, true);
                local.setUint16(12, dosDate, true);
                local.setUint32(14, crc, true);
                local.setUint32(18, data.length, true);
                local.setUint32(22, data.length, true);
                local.setUint16(26, nameBytes.length, true);
                local.setUint16(28, 0, true);
                chunks.push(new Uint8Array(local.buffer), nameBytes, data);

                const cd = new DataView(new ArrayBuffer(46));
                cd.setUint32(0, 0x02014b50, true);     // central directory
                cd.setUint16(4, 20, true);
                cd.setUint16(6, 20, true);
                cd.setUint16(8, 0x0800, true);
                cd.setUint16(10, 0, true);
                cd.setUint16(12, dosTime, true);
                cd.setUint16(14, dosDate, true);
                cd.setUint32(16, crc, true);
                cd.setUint32(20, data.length, true);
                cd.setUint32(24, data.length, true);
                cd.setUint16(28, nameBytes.length, true);
                cd.setUint32(42, offset, true);
                central.push(new Uint8Array(cd.buffer), nameBytes);

                offset += 30 + nameBytes.length + data.length;
            });

            let centralSize = 0;
            central.forEach(c => { centralSize += c.length; });
            const eocd = new DataView(new ArrayBuffer(22));
            eocd.setUint32(0, 0x06054b50, true);       // end of central dir
            eocd.setUint16(8, files.length, true);
            eocd.setUint16(10, files.length, true);
            eocd.setUint32(12, centralSize, true);
            eocd.setUint32(16, offset, true);
            chunks.push(...central, new Uint8Array(eocd.buffer));

            return new Blob(chunks, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        }

        const xmlEscape = (s) => String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ""); // illegal in XML 1.0

        function colRef(i) { // 0 → "A", 26 → "AA"
            let ref = "";
            for (i += 1; i > 0;) {
                const m = (i - 1) % 26;
                ref = String.fromCharCode(65 + m) + ref;
                i = (i - m - 1) / 26;
            }
            return ref;
        }

        // headers: string[] · rows: (string|number)[][] · widths: number[]
        function build(sheetName, headers, rows, widths) {
            const cell = (rowIdx, colIdx, value, styleId) => {
                const ref = colRef(colIdx) + (rowIdx + 1);
                const s = styleId ? ' s="' + styleId + '"' : "";
                if (typeof value === "number" && isFinite(value)) {
                    return '<c r="' + ref + '"' + s + "><v>" + value + "</v></c>";
                }
                return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(value) + "</t></is></c>";
            };

            let sheetRows = '<row r="1">' + headers.map((h, c) => cell(0, c, h, 1)).join("") + "</row>";
            rows.forEach((row, ri) => {
                sheetRows += '<row r="' + (ri + 2) + '">' + row.map((v, c) => cell(ri + 1, c, v, 0)).join("") + "</row>";
            });
            const cols = widths.map((w, i) =>
                '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join("");

            const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
            return zip([
                {
                    name: "[Content_Types].xml",
                    text: XML_HEAD +
                        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
                        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
                        '<Default Extension="xml" ContentType="application/xml"/>' +
                        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
                        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
                        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
                        "</Types>"
                },
                {
                    name: "_rels/.rels",
                    text: XML_HEAD +
                        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
                        "</Relationships>"
                },
                {
                    name: "xl/workbook.xml",
                    text: XML_HEAD +
                        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
                        '<sheets><sheet name="' + xmlEscape(sheetName) + '" sheetId="1" r:id="rId1"/></sheets>' +
                        "</workbook>"
                },
                {
                    name: "xl/_rels/workbook.xml.rels",
                    text: XML_HEAD +
                        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
                        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
                        "</Relationships>"
                },
                {
                    name: "xl/styles.xml",
                    text: XML_HEAD +
                        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
                        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
                        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
                        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
                        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
                        '<cellXfs count="2">' +
                        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
                        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
                        "</cellXfs>" +
                        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
                        "</styleSheet>"
                },
                {
                    name: "xl/worksheets/sheet1.xml",
                    text: XML_HEAD +
                        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
                        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
                        "<cols>" + cols + "</cols>" +
                        "<sheetData>" + sheetRows + "</sheetData>" +
                        "</worksheet>"
                }
            ]);
        }

        return { build };
    })();

    $("#export-xlsx-btn").addEventListener("click", () => {
        const blob = XlsxWriter.build(
            "Guest List",
            ADMIN_COLUMNS,
            adminData.map(adminRow),
            [24, 22, 11, 9, 48, 20]
        );
        downloadBlob(blob, "wedding_guest_list.xlsx");
    });

    // ---- Export: CSV ----
    $("#export-csv-btn").addEventListener("click", () => {
        const quote = (v) => {
            let s = String(v == null ? "" : v).replace(/"/g, '""').replace(/[\r\n]+/g, " ");
            // Guests type their own names and wishes, and a spreadsheet reads
            // a leading =, +, - or @ as the start of a formula rather than as
            // text — so "=HYPERLINK(...)" or "=IMPORTXML(...)" would run when
            // the couple opens the export. A leading tab or CR is stripped by
            // Excel before that test, so those lead in to the same thing and
            // are covered too. The apostrophe forces the cell to plain text.
            if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
            return '"' + s + '"';
        };
        let csv = "\uFEFF" + ADMIN_COLUMNS.join(",") + "\r\n";
        adminData.forEach(r => {
            csv += adminRow(r).map(v => (typeof v === "number" ? v : quote(v))).join(",") + "\r\n";
        });
        downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), "wedding_guest_list.csv");
    });

    // ---- Clear guest list (passcode-protected) ----
    // The button only reveals a confirmation panel; nothing is deleted
    // until the access passcode is typed again. The code travels with the
    // "clear" action and is verified on Google's servers — the same check
    // as unlocking, so a tampered-with page cannot skip it.
    const clearConfirm = $("#admin-clear-confirm");
    const clearPasscodeInput = $("#admin-clear-passcode");
    const clearDeleteBtn = $("#admin-clear-delete-btn");
    const clearErrorEl = $("#admin-clear-error");

    function hideClearConfirm() {
        clearConfirm.hidden = true;
        clearPasscodeInput.value = "";
        clearErrorEl.hidden = true;
        setClearBusy(false);
    }

    function setClearBusy(busy) {
        clearDeleteBtn.disabled = busy;
        clearDeleteBtn.textContent = busy ? "Deleting…" : "Delete";
    }

    function clearFail(message) {
        clearErrorEl.textContent = message;
        clearErrorEl.hidden = false;
        clearPasscodeInput.select();
    }

    clearBtn.addEventListener("click", () => {
        if (clearConfirm.hidden) {
            clearConfirm.hidden = false;
            clearPasscodeInput.focus();
        } else {
            hideClearConfirm();
        }
    });

    $("#admin-clear-cancel-btn").addEventListener("click", hideClearConfirm);

    clearConfirm.addEventListener("submit", (event) => {
        event.preventDefault();
        const code = clearPasscodeInput.value;
        if (!code) {
            clearFail("Please enter the passcode.");
            return;
        }

        if (adminDataSource !== "server") {
            // Nothing to clear on the server, and no way to check a passcode
            // without one — the dashboard cannot be unlocked in this state.
            clearFail("The guest list isn't connected yet. See BACKEND_SETUP.md.");
            return;
        }

        setClearBusy(true);
        backendPost({ action: "clear", passcode: code })
            .then(data => {
                setClearBusy(false);
                if (data && data.ok) {
                    hideClearConfirm();
                    renderAdmin([], "server");
                } else if (data && data.error === "unauthorized") {
                    clearFail("Incorrect passcode.");
                } else if (data && data.error === "unknown_action") {
                    clearFail("The backend doesn't support clearing yet — redeploy the latest Code.gs (see BACKEND_SETUP.md).");
                } else {
                    clearFail("The guest-list service returned an error. Please try again.");
                }
            })
            .catch(() => {
                setClearBusy(false);
                clearFail("Couldn't reach the guest-list service. Check your connection and try again.");
            });
    });

    // ============================================================
    // NAV + FULLSCREEN MENU
    // ============================================================
    const nav = $("#site-nav");
    const menuOverlay = $("#menu-overlay");
    const menuToggle = $("#menu-toggle");
    let menuOpen = false;
    let lastScrollY = window.scrollY;

    window.addEventListener("scroll", () => {
        const y = window.scrollY;
        if (!menuOpen) {
            nav.classList.toggle("nav-hidden", y > 400 && y > lastScrollY);
        }
        lastScrollY = y;
    }, { passive: true });

    function openMenu() {
        menuOpen = true;
        document.body.classList.add("menu-open");
        menuToggle.setAttribute("aria-expanded", "true");
        menuToggle.setAttribute("aria-label", "Close menu");
        menuOverlay.setAttribute("aria-hidden", "false");
        menuOverlay.style.visibility = "visible";
        scrollLock(true);
        if (hasGSAP && !reducedMotion) {
            gsap.fromTo(menuOverlay,
                { clipPath: "inset(0% 0% 100% 0%)" },
                { clipPath: "inset(0% 0% 0% 0%)", duration: 0.8, ease: "power4.inOut" });
            gsap.fromTo(".menu-link", { yPercent: 60, opacity: 0 },
                { yPercent: 0, opacity: 1, duration: 0.8, ease: "power3.out", stagger: 0.06, delay: 0.25 });
        } else {
            menuOverlay.style.clipPath = "inset(0% 0% 0% 0%)";
        }
    }

    function closeMenu() {
        if (!menuOpen) return;
        menuOpen = false;
        document.body.classList.remove("menu-open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.setAttribute("aria-label", "Open menu");
        menuOverlay.setAttribute("aria-hidden", "true");
        scrollLock(false);
        const hide = () => { menuOverlay.style.visibility = "hidden"; };
        if (hasGSAP && !reducedMotion) {
            gsap.to(menuOverlay, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.7, ease: "power4.inOut", onComplete: hide });
        } else {
            menuOverlay.style.clipPath = "inset(0% 0% 100% 0%)";
            hide();
        }
    }

    menuToggle.addEventListener("click", () => (menuOpen ? closeMenu() : openMenu()));

    // ============================================================
    // GLOBAL KEYBOARD
    // ============================================================
    // keep Tab inside whichever modal is open
    function trapFocus(container, e) {
        const focusables = $$(
            'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
            container
        ).filter(el => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        } else if (!container.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
        }
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            $$(".modal.open").forEach(m => closeModal(m));
            closeMenu();
        }
        if (e.key === "Tab") {
            // the fullscreen menu covers the page just as a modal does, so Tab
            // has to stay inside it too
            const openOverlay = $(".modal.open") || (menuOpen ? menuOverlay : null);
            if (openOverlay) trapFocus(openOverlay, e);
        }
    });

    // ============================================================
    // CUSTOM CURSOR (fine pointers, motion allowed)
    // ============================================================
    function initCursor() {
        if (!finePointer || reducedMotion || !hasGSAP) return;
        const dot = $("#cursor-dot");
        const ring = $("#cursor-ring");
        const pos = { x: -100, y: -100 };
        const ringPos = { x: -100, y: -100 };
        let shown = false;

        window.addEventListener("mousemove", (e) => {
            pos.x = e.clientX;
            pos.y = e.clientY;
            if (!shown) {
                shown = true;
                gsap.to([dot, ring], { opacity: 1, duration: 0.4 });
            }
        }, { passive: true });

        gsap.ticker.add(() => {
            ringPos.x += (pos.x - ringPos.x) * 0.14;
            ringPos.y += (pos.y - ringPos.y) * 0.14;
            dot.style.transform = "translate(" + pos.x + "px," + pos.y + "px)";
            ring.style.left = ringPos.x + "px";
            ring.style.top = ringPos.y + "px";
        });

        const hoverSelector = "a, button, input, select, textarea, .segment";
        document.addEventListener("mouseover", (e) => {
            if (e.target.closest(hoverSelector)) document.body.classList.add("cursor-hover");
        });
        document.addEventListener("mouseout", (e) => {
            if (e.target.closest(hoverSelector)) document.body.classList.remove("cursor-hover");
        });
    }

    // ============================================================
    // MAGNETIC BUTTONS — primary CTAs lean toward the cursor
    // ============================================================
    function initMagnetic() {
        if (!finePointer || reducedMotion || !hasGSAP) return;
        const STRENGTH = 0.32;
        $$(".nav-rsvp-btn, .rsvp-submit, .modal-btn, .admin-trigger").forEach(el => {
            const xTo = gsap.quickTo(el, "x", { duration: 0.55, ease: "power3.out" });
            const yTo = gsap.quickTo(el, "y", { duration: 0.55, ease: "power3.out" });
            el.addEventListener("mousemove", (e) => {
                const r = el.getBoundingClientRect();
                xTo((e.clientX - (r.left + r.width / 2)) * STRENGTH);
                yTo((e.clientY - (r.top + r.height / 2)) * STRENGTH);
            });
            el.addEventListener("mouseleave", () => { xTo(0); yTo(0); });
        });
    }

    // ============================================================
    // SCROLL-VELOCITY SKEW — headings flex with scroll speed
    // ============================================================
    function initScrollSkew() {
        if (!hasGSAP || !hasLenis || reducedMotion || !lenis) return;
        const setters = $$(".section-title").map(el => {
            el.style.willChange = "transform";
            return gsap.quickSetter(el, "skewY", "deg");
        });
        if (!setters.length) return;
        const clamp = gsap.utils.clamp(-6, 6);
        let current = 0;
        gsap.ticker.add(() => {
            const target = clamp((lenis.velocity || 0) * 0.32);
            current += (target - current) * 0.1;
            if (Math.abs(current) < 0.001) current = 0;
            setters.forEach(set => set(current));
        });
    }

    // ============================================================
    // AMBIENT MUSIC — soft WebAudio piano arpeggios
    // ============================================================
    const musicToggle = $("#music-toggle");
    const Music = (() => {
        const STORE_KEY = "annsweety-music";
        // the event types that actually grant user activation, so a blocked
        // autoplay can be picked up by the visitor's very first interaction
        const GESTURES = ["pointerdown", "touchend", "keydown", "click"];
        const FADE_IN = 2.4;
        const FADE_OUT = 0.6;

        let ctx = null;
        let master = null;
        let playing = false;   // notes are actually being scheduled
        let wanted = false;    // the music is meant to be on
        let armed = false;     // waiting on a first gesture to unblock audio
        let intervalId = null;
        let chordIndex = 0;
        let step = 0;

        const chords = [
            [65.41, 130.81, 164.81, 196.00, 246.94, 293.66, 329.63, 392.00], // Cmaj9
            [55.00, 110.00, 146.83, 164.81, 220.00, 261.63, 329.63, 392.00], // Am9
            [43.65, 87.31, 130.81, 174.61, 220.00, 261.63, 329.63, 440.00],  // Fmaj9
            [49.00, 98.00, 146.83, 196.00, 246.94, 293.66, 329.63, 392.00]   // G6/9
        ];

        function tone(freq, time, dur, vel) {
            const osc = ctx.createOscillator();
            const octave = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, time);
            octave.type = "sine";
            octave.frequency.setValueAtTime(freq * 2, time);
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(1200, time);
            gain.gain.setValueAtTime(0, time);
            gain.gain.linearRampToValueAtTime(vel, time + 0.15);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);

            const delay = ctx.createDelay();
            delay.delayTime.value = 0.3;
            const delayGain = ctx.createGain();
            delayGain.gain.value = 0.25;

            osc.connect(filter);
            octave.connect(filter);
            filter.connect(gain);
            gain.connect(master);
            gain.connect(delay);
            delay.connect(delayGain);
            delayGain.connect(master);

            osc.start(time);
            octave.start(time);
            osc.stop(time + dur + 0.5);
            octave.stop(time + dur + 0.5);
        }

        function playStep() {
            const chord = chords[chordIndex];
            const now = ctx.currentTime;
            const pattern = [
                () => { tone(chord[0], now, 3.2, 0.08); tone(chord[3], now, 0.8, 0.04); },
                () => tone(chord[5], now, 0.8, 0.03),
                () => tone(chord[4], now, 0.8, 0.03),
                () => tone(chord[6], now, 0.8, 0.04),
                () => { tone(chord[1], now, 2.5, 0.06); tone(chord[3], now, 0.8, 0.04); },
                () => tone(chord[5], now, 0.8, 0.03),
                () => tone(chord[7], now, 0.8, 0.05),
                () => tone(chord[6], now, 0.8, 0.03)
            ];
            pattern[step]();
            step = (step + 1) % 8;
            if (step === 0) chordIndex = (chordIndex + 1) % chords.length;
        }

        // a pause is remembered for the tab only, so every fresh visit still
        // opens with music while a deliberate "off" survives in-session reloads
        function remember(v) { try { sessionStorage.setItem(STORE_KEY, v); } catch (e) { /* private mode */ } }
        function recall() { try { return sessionStorage.getItem(STORE_KEY); } catch (e) { return null; } }

        // the button reflects audible sound, never mere intent — while autoplay
        // is still blocked the site is silent, and the bars must not claim otherwise
        function setUI() {
            if (!musicToggle) return;
            musicToggle.classList.toggle("playing", playing);
            musicToggle.setAttribute("aria-pressed", String(playing));
            musicToggle.setAttribute("aria-label", playing ? "Pause ambient music" : "Play ambient music");
        }

        function ensureContext() {
            if (ctx) return true;
            try {
                ctx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) { return false; }
            master = ctx.createGain();
            master.gain.value = 0;
            master.connect(ctx.destination);
            // the single reliable signal that audio was unblocked — covers the
            // resume() promise that some browsers leave pending indefinitely
            ctx.onstatechange = () => {
                if (ctx.state === "running") {
                    if (wanted && !playing) beginLoop();
                } else if (playing) {
                    // suspended out from under us (iOS call, tab interruption):
                    // stop scheduling, since ctx.currentTime freezes and every
                    // queued note would land in one burst on resume
                    stopLoop();
                    arm();
                }
            };
            return true;
        }

        function beginLoop() {
            if (playing || !ctx || ctx.state !== "running") return;
            playing = true;
            step = 0;
            const t = ctx.currentTime;
            master.gain.cancelScheduledValues(t);
            master.gain.setValueAtTime(master.gain.value, t);
            master.gain.linearRampToValueAtTime(1, t + FADE_IN);
            playStep();
            intervalId = setInterval(playStep, 400);
            disarm();
            setUI();
        }

        function stopLoop() {
            if (!playing) return;
            playing = false;
            clearInterval(intervalId);
            intervalId = null;
            if (master && ctx) {
                const t = ctx.currentTime;
                master.gain.cancelScheduledValues(t);
                master.gain.setValueAtTime(master.gain.value, t);
                master.gain.linearRampToValueAtTime(0, t + FADE_OUT);
            }
            setUI();
        }

        function onGesture(e) {
            // the toggle runs its own handler; starting here too would make its
            // click both start and immediately stop the music
            if (e.target && e.target.closest && e.target.closest("#music-toggle")) return;
            start();
        }

        function arm() {
            if (armed) return;
            armed = true;
            GESTURES.forEach(type => document.addEventListener(type, onGesture, { passive: true }));
        }

        function disarm() {
            if (!armed) return;
            armed = false;
            GESTURES.forEach(type => document.removeEventListener(type, onGesture));
        }

        function start() {
            wanted = true;
            if (playing || !ensureContext()) return;
            if (ctx.state === "running") { beginLoop(); return; }
            const resuming = ctx.resume();
            if (resuming && typeof resuming.then === "function") resuming.catch(() => { /* still blocked */ });
            setTimeout(() => {
                if (!wanted || playing) return;
                if (ctx.state === "running") beginLoop();
                else arm();
            }, 150);
        }

        return {
            toggle() {
                if (playing) {
                    wanted = false;
                    remember("off");
                    disarm();
                    stopLoop();
                } else {
                    // a click is itself a gesture, so this start always takes
                    remember("on");
                    start();
                }
            },
            autoplay() {
                if (recall() === "off") { setUI(); return; }
                arm();
                start();
            }
        };
    })();
    if (musicToggle) musicToggle.addEventListener("click", () => Music.toggle());

    // ============================================================
    // BOOT
    // ============================================================
    populateContent();
    buildHero();
    renderWishes();
    initCountdown();
    initReveals();
    initCursor();
    initMagnetic();
    initScrollSkew();
    runPreloader();
    Music.autoplay();

    // disarms the preloader failsafe in index.html — only once the whole
    // boot sequence (including preloader dismissal) has been scheduled
    window.__weddingBooted = true;

    if (hasScrollTrigger) {
        window.addEventListener("load", () => ScrollTrigger.refresh());
    }
})();
