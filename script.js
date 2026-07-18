/* ============================================================
   MASCHIO & ANN SWEETY — "THE GOLDEN HOUR"
   A modern editorial wedding invitation.

   Motion:   GSAP + ScrollTrigger (choreography), Lenis (smooth
             scroll), Three.js (flowing silk shader + drifting
             champagne dust behind the hero and footer).
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
    const hasThree = typeof window.THREE !== "undefined";

    if (hasScrollTrigger) gsap.registerPlugin(ScrollTrigger);

    const $ = (sel, root) => (root || document).querySelector(sel);
    const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

    function escapeHtml(unsafe) {
        if (!unsafe) return "";
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
    const DEFAULT_WISHES = [
        { name: "Jessica & Michael", email: "", attendance: "attending", guests: 2, diet: "none", wishes: "Congratulations! We are so excited to see you two tie the knot. Wishing you a lifetime of love and happiness!", timestamp: "2026-07-08 14:32:00" },
        { name: "Uncle David & Aunt Clara", email: "", attendance: "attending", guests: 2, diet: "none", wishes: "So happy to be there to witness your vows. Wishing you every blessing.", timestamp: "2026-07-06 09:12:00" },
        { name: "Sophia Martinez", email: "", attendance: "attending", guests: 1, diet: "none", wishes: "May your life together be filled with joy, adventure, and lots of laughter!", timestamp: "2026-07-05 18:45:00" }
    ];

    function getRSVPs() {
        try {
            const list = localStorage.getItem("wedding_rsvps");
            return list ? JSON.parse(list) : [];
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

    if (getRSVPs().length === 0) saveRSVPs(DEFAULT_WISHES);

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
            if (heroTitle) heroTitle.setAttribute("aria-label", config.groomName + " and " + config.brideName);
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
            const names = (config.groomName || "Maschio") + " & " + (config.brideName || "Ann Sweety");
            const items = ["Save the date", config.weddingDateText || "September 24, 2026", names, "New Delhi", "<em>Celebrate with us</em>"];
            const chunkHTML = items.map(t => '<span class="marquee-item">' + t + '</span><span class="marquee-star">✦</span>').join("");
            track.innerHTML = '<div class="marquee-chunk">' + chunkHTML + '</div><div class="marquee-chunk">' + chunkHTML + '</div>';
        }
    }

    // ============================================================
    // THREE.JS — FLOWING SILK + CHAMPAGNE DUST
    // ============================================================
    const Silk = (() => {
        const canvas = $("#silk-canvas");
        if (!canvas || !hasThree) return { active: false };

        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "low-power" });
        } catch (e) {
            canvas.style.display = "none";
            return { active: false };
        }

        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const uniforms = {
            uTime: { value: 0 },
            uRes: { value: new THREE.Vector2(1, 1) },
            uMouse: { value: new THREE.Vector2(0.5, 0.5) }
        };

        const silkMat = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: "void main(){ gl_Position = vec4(position, 1.0); }",
            fragmentShader: [
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
        });
        scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), silkMat));

        // drifting champagne dust
        const DUST = 110;
        const positions = new Float32Array(DUST * 3);
        const speeds = new Float32Array(DUST);
        for (let i = 0; i < DUST; i++) {
            positions[i * 3] = Math.random() * 2 - 1;
            positions[i * 3 + 1] = Math.random() * 2 - 1;
            positions[i * 3 + 2] = 0;
            speeds[i] = 0.02 + Math.random() * 0.06;
        }
        const dustGeo = new THREE.BufferGeometry();
        dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

        const sprite = (() => {
            const c = document.createElement("canvas");
            c.width = c.height = 64;
            const ctx = c.getContext("2d");
            const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
            g.addColorStop(0, "rgba(176, 138, 80, 0.9)");
            g.addColorStop(0.4, "rgba(176, 138, 80, 0.28)");
            g.addColorStop(1, "rgba(176, 138, 80, 0)");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 64, 64);
            const tex = new THREE.CanvasTexture(c);
            return tex;
        })();

        const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
            size: 0.02,
            map: sprite,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            blending: THREE.NormalBlending
        }));
        scene.add(dust);

        function resize() {
            const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
            const w = window.innerWidth, h = window.innerHeight;
            renderer.setPixelRatio(dpr);
            renderer.setSize(w, h, false);
            uniforms.uRes.value.set(w * dpr, h * dpr);
            if (reducedMotion) renderer.render(scene, camera);
        }
        resize();
        window.addEventListener("resize", resize);

        const mouseTarget = { x: 0.5, y: 0.5 };
        if (finePointer && !reducedMotion) {
            window.addEventListener("mousemove", (e) => {
                mouseTarget.x = e.clientX / window.innerWidth;
                mouseTarget.y = 1 - e.clientY / window.innerHeight;
            }, { passive: true });
        }

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

        const clock = new THREE.Clock();
        let elapsed = 0;

        function frame() {
            requestAnimationFrame(frame);
            if (!pageVisible || (!heroVisible && !footerVisible)) return;
            const dt = Math.min(clock.getDelta(), 0.05);
            elapsed += dt;
            uniforms.uTime.value = elapsed;
            uniforms.uMouse.value.x += (mouseTarget.x - uniforms.uMouse.value.x) * 0.04;
            uniforms.uMouse.value.y += (mouseTarget.y - uniforms.uMouse.value.y) * 0.04;

            const pos = dustGeo.attributes.position.array;
            for (let i = 0; i < DUST; i++) {
                pos[i * 3 + 1] += speeds[i] * dt;
                pos[i * 3] += Math.sin(elapsed * 0.4 + i) * 0.00016;
                if (pos[i * 3 + 1] > 1.05) {
                    pos[i * 3 + 1] = -1.05;
                    pos[i * 3] = Math.random() * 2 - 1;
                }
            }
            dustGeo.attributes.position.needsUpdate = true;

            renderer.render(scene, camera);
        }

        if (reducedMotion) {
            uniforms.uTime.value = 12;
            renderer.render(scene, camera);
        } else {
            frame();
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

    function scrollLock(lock) {
        document.body.classList.toggle("no-scroll", lock);
        if (lenis) lock ? lenis.stop() : lenis.start();
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
    // GALLERY — pinned horizontal scroll (desktop only)
    // ============================================================
    function initGallery() {
        if (!hasScrollTrigger || reducedMotion) return;
        const mm = gsap.matchMedia();
        mm.add("(min-width: 900px)", () => {
            const track = $("#gallery-track");
            const pin = $("#gallery-pin");
            if (!track || !pin) return;
            // clamp: with few items the track can be narrower than the viewport
            const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 80);
            const tween = gsap.to(track, {
                x: () => -distance(),
                ease: "none",
                scrollTrigger: {
                    trigger: pin,
                    start: "top top",
                    end: () => "+=" + distance(),
                    scrub: 1,
                    pin: true,
                    anticipatePin: 1,
                    invalidateOnRefresh: true
                }
            });
            return () => { tween.scrollTrigger && tween.scrollTrigger.kill(); tween.kill(); gsap.set(track, { x: 0 }); };
        });
    }

    // ============================================================
    // LIGHTBOX
    // ============================================================
    const lightbox = $("#lightbox");
    const lightboxImg = $("#lightbox-img");
    const lightboxCaption = $("#lightbox-caption");
    const galleryFigures = $$(".gallery-item");
    let lightboxIndex = 0;

    const photos = galleryFigures.map(fig => {
        const img = $("img", fig);
        const cap = $("figcaption", fig);
        return {
            src: img.src,
            alt: img.alt,
            caption: cap ? cap.textContent.trim() : ""
        };
    });

    let lightboxReturnFocus = null;

    function openLightbox(index) {
        lightboxIndex = index;
        updateLightbox();
        lightboxReturnFocus = document.activeElement;
        lightbox.classList.add("open");
        lightbox.setAttribute("aria-hidden", "false");
        scrollLock(true);
        // deferred: the overlay is still visibility:hidden in the frame the
        // class lands, and focus() on a hidden element is silently refused
        setTimeout(() => $("#lightbox-close").focus(), 60);
    }

    function closeLightbox() {
        lightbox.classList.remove("open");
        lightbox.setAttribute("aria-hidden", "true");
        scrollLock(false);
        if (lightboxReturnFocus && document.contains(lightboxReturnFocus)) lightboxReturnFocus.focus();
    }

    function stepLightbox(dir) {
        lightboxIndex = (lightboxIndex + dir + photos.length) % photos.length;
        updateLightbox();
    }

    function updateLightbox() {
        const p = photos[lightboxIndex];
        lightboxImg.src = p.src;
        lightboxImg.alt = p.alt;
        lightboxCaption.textContent = p.caption;
    }

    galleryFigures.forEach((fig, i) => {
        // the whole frame opens the lightbox, and is keyboard-operable
        const wrap = $(".gallery-img-wrap", fig);
        wrap.setAttribute("role", "button");
        wrap.setAttribute("tabindex", "0");
        wrap.setAttribute("aria-label", "View photo: " + photos[i].alt);
        wrap.addEventListener("click", () => openLightbox(i));
        wrap.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openLightbox(i);
            }
        });
    });
    $("#lightbox-close").addEventListener("click", closeLightbox);
    $("#lightbox-prev").addEventListener("click", () => stepLightbox(-1));
    $("#lightbox-next").addEventListener("click", () => stepLightbox(1));
    lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });

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
                if (note) note.textContent = "The day has arrived — with love, " + (config.initials || "M & A");
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
    const GUEST_MAX = 5;

    function refreshStepper() {
        guestValue.textContent = String(guestCount);
        $("#guest-minus").disabled = guestCount <= 1;
        $("#guest-plus").disabled = guestCount >= GUEST_MAX;
    }

    $("#guest-minus").addEventListener("click", () => { guestCount = Math.max(1, guestCount - 1); refreshStepper(); });
    $("#guest-plus").addEventListener("click", () => { guestCount = Math.min(GUEST_MAX, guestCount + 1); refreshStepper(); });
    refreshStepper();

    $$('input[name="attendance"]', rsvpForm).forEach(radio => {
        radio.addEventListener("change", () => {
            const declined = radio.value === "declined" && radio.checked;
            detailsBlock.classList.toggle("collapsed", declined);
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
        if (rsvpSending || !rsvpForm.reportValidity()) return;

        const name = $("#guest-name").value.trim();
        const email = $("#guest-email").value.trim();
        const attendance = $('input[name="attendance"]:checked', rsvpForm).value;
        const diet = $("#diet-pref").value;
        const wishes = $("#wishes").value.trim();
        if (!name || !email) return;

        const now = new Date();
        const two = (n) => String(n).padStart(2, "0");
        const timestamp = now.getFullYear() + "-" + two(now.getMonth() + 1) + "-" + two(now.getDate()) +
            " " + two(now.getHours()) + ":" + two(now.getMinutes()) + ":" + two(now.getSeconds());

        const entry = {
            name, email, attendance,
            guests: attendance === "attending" ? guestCount : 0,
            diet: attendance === "attending" ? diet : "none",
            wishes, timestamp
        };

        // always keep a copy on this device (drives the wish wall + local mode)
        const list = getRSVPs();
        list.push(entry);
        const saved = saveRSVPs(list);

        // optional generic webhook copy (email notification services etc.)
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
            if (delivered === "failed") {
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
            detailsBlock.classList.remove("collapsed");
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

        backendPost({ action: "rsvp", name: entry.name, email: entry.email, attendance: entry.attendance, guests: entry.guests, diet: entry.diet, wishes: entry.wishes, timestamp: entry.timestamp })
            .then(data => {
                restore();
                finishSubmit(data && data.ok ? "delivered" : "failed");
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
        const entries = getRSVPs().filter(r => r.wishes && r.wishes.trim()).reverse();
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
    // ADD TO CALENDAR (.ics download)
    // ============================================================
    function escapeICSText(text) {
        return String(text || "")
            .replace(/\\/g, "\\\\")
            .replace(/;/g, "\\;")
            .replace(/,/g, "\\,")
            .replace(/\r?\n/g, "\\n");
    }

    window.addToCalendar = function (type) {
        const evt = config.events && config.events[type];
        if (!evt) return;

        const title = (config.groomName || "") + " and " + (config.brideName || "") + " — " + evt.title;
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

        const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = type + "_event.ics";
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    // ============================================================
    // ADMIN DASHBOARD (passcode-protected guest list)
    //
    // Backend mode (config.backendUrl set): the passcode is sent to the
    // Google Apps Script backend, verified on Google's servers, and the
    // full guest list (all guests, all devices) comes back with it.
    // Local mode (no backendUrl): falls back to the on-device list and
    // the config.adminPasscode check (demo only — see config.js).
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

    let adminUnlocked = false;   // survives modal close, resets on page reload
    let adminKey = "";           // passcode kept in memory only, for refreshes
    let adminData = [];          // the rows currently shown (drives exports)
    let adminDataSource = "local"; // "server" or "local" — set by renderAdmin

    const ADMIN_COLUMNS = ["Guest Name", "Email", "Attending", "Guests", "Dietary Preference", "Wishes", "Timestamp"];

    // one RSVP object → one flat export row (shared by Excel and CSV)
    function adminRow(r) {
        const attending = r.attendance === "attending";
        return [
            r.name, r.email,
            attending ? "Yes" : "No",
            attending ? (parseInt(r.guests, 10) || 0) : 0,
            attending ? (r.diet || "none") : "N/A",
            r.wishes || "", r.timestamp || ""
        ];
    }

    $("#admin-trigger").addEventListener("click", () => {
        if (adminUnlocked) {
            showAdminDashboard();
            if (backendUrl()) refreshAdminData(); // re-sync on reopen
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
            // local demo mode: client-side check (see note in config.js)
            if (code === (config.adminPasscode || "2026")) {
                adminUnlocked = true;
                renderAdmin(getRSVPs(), "local");
                showAdminDashboard();
            } else {
                lockFail("Incorrect passcode.");
            }
            return;
        }

        setLockBusy(true);
        backendPost({ action: "list", passcode: code })
            .then(data => {
                setLockBusy(false);
                if (data && data.ok) {
                    adminUnlocked = true;
                    adminKey = code;
                    renderAdmin(data.entries || [], "server");
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
                    renderAdmin(data.entries || [], "server");
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

        const tbody = $("#rsvp-table-body");
        if (adminData.length === 0) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No RSVPs yet.</td></tr>';
            return;
        }
        tbody.innerHTML = adminData.map(entry => {
            const attendingRow = entry.attendance === "attending";
            return "<tr>" +
                "<td><strong>" + escapeHtml(entry.name) + "</strong></td>" +
                "<td>" + escapeHtml(entry.email) + "</td>" +
                '<td><span class="pill ' + (attendingRow ? "yes" : "no") + '">' + (attendingRow ? "Yes" : "No") + "</span></td>" +
                "<td>" + (attendingRow ? (parseInt(entry.guests, 10) || 0) : "0") + "</td>" +
                '<td style="text-transform:capitalize">' + (attendingRow ? escapeHtml(entry.diet) : "—") + "</td>" +
                '<td class="wish-cell">' + (escapeHtml(entry.wishes) || "—") + "</td>" +
                "<td>" + escapeHtml(entry.timestamp || "") + "</td>" +
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
            [24, 30, 11, 9, 20, 48, 20]
        );
        downloadBlob(blob, "wedding_guest_list.xlsx");
    });

    // ---- Export: CSV ----
    $("#export-csv-btn").addEventListener("click", () => {
        const quote = (v) => {
            let s = String(v == null ? "" : v).replace(/"/g, '""').replace(/\r?\n/g, " ");
            // guests type their own names/wishes: neutralise spreadsheet
            // formula injection ("=cmd()", "+…", "-…", "@…") on export
            if (/^[=+\-@]/.test(s)) s = "'" + s;
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
    // until the access passcode is typed again. In backend mode the code
    // travels with the "clear" action and is verified on Google's servers
    // (same check as unlocking); in local demo mode it is checked against
    // config.adminPasscode, like the lock screen.
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
            // local demo mode: same client-side check as the lock screen
            if (code === (config.adminPasscode || "2026")) {
                saveRSVPs(DEFAULT_WISHES);
                hideClearConfirm();
                renderAdmin(getRSVPs(), "local");
                renderWishes();
            } else {
                clearFail("Incorrect passcode.");
            }
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
    // keep Tab inside whichever overlay (modal / lightbox) is open
    function trapFocus(container, e) {
        const focusables = $$(
            'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
            container
        ).filter(el => el.offsetParent !== null || container === lightbox);
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
            if (lightbox.classList.contains("open")) closeLightbox();
            $$(".modal.open").forEach(m => closeModal(m));
            closeMenu();
        }
        if (lightbox.classList.contains("open")) {
            if (e.key === "ArrowLeft") stepLightbox(-1);
            if (e.key === "ArrowRight") stepLightbox(1);
        }
        if (e.key === "Tab") {
            const openOverlay = $(".modal.open") || (lightbox.classList.contains("open") ? lightbox : null);
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

        const hoverSelector = "a, button, input, select, textarea, .segment, .gallery-img-wrap";
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
    // SCROLL-VELOCITY SKEW — headings & photos flex with scroll speed
    // ============================================================
    function initScrollSkew() {
        if (!hasGSAP || !hasLenis || reducedMotion || !lenis) return;
        const setters = $$(".section-title, .gallery-img-wrap").map(el => {
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
    // IMAGE DEPTH — pointer-driven 3D tilt + in-frame parallax
    // ============================================================
    function initImageDepth() {
        if (!finePointer || reducedMotion || !hasGSAP) return;
        $$(".gallery-item").forEach(item => {
            const wrap = $(".gallery-img-wrap", item);
            const img = wrap && $("img", wrap);
            if (!wrap || !img) return;
            // img rests at scale(1.08) (CSS) — enough overflow for in-frame parallax
            const rotX = gsap.quickTo(wrap, "rotationX", { duration: 0.5, ease: "power3.out" });
            const rotY = gsap.quickTo(wrap, "rotationY", { duration: 0.5, ease: "power3.out" });
            const imgX = gsap.quickTo(img, "xPercent", { duration: 0.6, ease: "power3.out" });
            const imgY = gsap.quickTo(img, "yPercent", { duration: 0.6, ease: "power3.out" });
            item.addEventListener("mousemove", (e) => {
                const r = wrap.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width - 0.5;
                const py = (e.clientY - r.top) / r.height - 0.5;
                rotY(px * 10);
                rotX(-py * 10);
                imgX(-px * 6);
                imgY(-py * 6);
            });
            item.addEventListener("mouseleave", () => {
                rotX(0); rotY(0); imgX(0); imgY(0);
            });
        });
    }

    // ============================================================
    // AMBIENT MUSIC — soft WebAudio piano arpeggios
    // ============================================================
    const musicToggle = $("#music-toggle");
    const Music = (() => {
        let ctx = null;
        let playing = false;
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
            gain.connect(ctx.destination);
            gain.connect(delay);
            delay.connect(delayGain);
            delayGain.connect(ctx.destination);

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

        return {
            toggle() {
                if (!ctx) {
                    try {
                        ctx = new (window.AudioContext || window.webkitAudioContext)();
                    } catch (e) { return; }
                }
                if (ctx.state === "suspended") ctx.resume();
                playing = !playing;
                musicToggle.classList.toggle("playing", playing);
                musicToggle.setAttribute("aria-pressed", String(playing));
                musicToggle.setAttribute("aria-label", playing ? "Pause ambient music" : "Play ambient music");
                if (playing) {
                    intervalId = setInterval(playStep, 400);
                } else {
                    clearInterval(intervalId);
                }
            }
        };
    })();
    musicToggle.addEventListener("click", () => Music.toggle());

    // ============================================================
    // BOOT
    // ============================================================
    populateContent();
    buildHero();
    renderWishes();
    initCountdown();
    initReveals();
    initGallery();
    initCursor();
    initMagnetic();
    initScrollSkew();
    initImageDepth();
    runPreloader();

    // disarms the preloader failsafe in index.html — only once the whole
    // boot sequence (including preloader dismissal) has been scheduled
    window.__weddingBooted = true;

    if (hasScrollTrigger) {
        window.addEventListener("load", () => ScrollTrigger.refresh());
    }
})();
