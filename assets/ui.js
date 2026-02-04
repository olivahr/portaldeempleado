// assets/ui.js
// UI helpers (no framework)
// ✅ Toast (single instance)
// ✅ Active nav (bottom nav + sidebar) with grouped routes (schedule-* → schedule)
// ✅ Global tap delegation (iOS-safe) using POINTER events (no double-fire)
// ✅ Empty states + skeletons
// ✅ Small builders (pill, row, section header)
// ✅ Optional drawer wiring (only if you actually use it)

export function uiSetText(el, text) {
  if (!el) return;
  el.textContent = text ?? "";
}

export function uiShow(el, show) {
  if (!el) return;
  el.style.display = show ? "" : "none";
}

/* =========================
   HTML SAFETY
   ========================= */
export function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   ROUTES
   ========================= */
export function uiRoute() {
  // ✅ Default route should be HOME (not progress)
  return (location.hash || "#home").replace("#", "").trim().toLowerCase() || "home";
}

export function uiGo(route) {
  const r = String(route || "").replace("#", "").trim().toLowerCase();
  location.hash = "#" + (r || "home");
}

// Grouped nav keys so bottom tabs highlight correctly
function navKey(route) {
  const r = String(route || "").trim().toLowerCase();
  if (!r) return "home";
  if (r.startsWith("schedule")) return "schedule";
  if (r === "timeoff") return "timeoff";
  // Home tab should also light up if you want progress under home:
  // (your employee.js also handles this, but this keeps HTML-only uiActiveNav solid)
  if (r === "progress") return "home";
  return r;
}

/* =========================
   TOAST
   ========================= */
let __toastEl = null;
let __toastHideTimer = null;

export function uiToast(text, ms = 2200) {
  const msg = String(text ?? "").trim();
  if (!msg) return;

  if (!__toastEl) {
    __toastEl = document.createElement("div");
    __toastEl.className = "toast";
    document.body.appendChild(__toastEl);
  }

  if (__toastHideTimer) clearTimeout(__toastHideTimer);

  __toastEl.textContent = msg;
  requestAnimationFrame(() => __toastEl.classList.add("show"));

  __toastHideTimer = setTimeout(() => {
    __toastEl?.classList.remove("show");
  }, ms);
}

/* =========================
   ACTIVE NAV
   ========================= */
export function uiActiveNav() {
  const route = uiRoute();
  const key = navKey(route);

  document.querySelectorAll(".nav-item").forEach((a) => {
    const r1 = (a.getAttribute("data-route") || "").trim().toLowerCase();
    const href = (a.getAttribute("href") || "").trim();
    const r2 = href.startsWith("#") ? href.replace("#", "").trim().toLowerCase() : "";

    const aKey1 = navKey(r1);
    const aKey2 = navKey(r2);

    const match =
      (r1 && (r1 === route || aKey1 === key)) ||
      (r2 && (r2 === route || aKey2 === key));

    a.classList.toggle("active", !!match);
  });
}

/* =========================
   GLOBAL ACTIONS (tiles/buttons)
   =========================
   Use in HTML:
     <div class="tile" data-route="timecard">...</div>
     <button data-route="report-absence">...</button>

   Or actions:
     <div data-action="correct-punch"></div>
     Then register:
       uiRegisterAction("correct-punch", () => {...});
*/
const __actions = new Map();

export function uiRegisterAction(name, fn) {
  const key = String(name || "").trim().toLowerCase();
  if (!key || typeof fn !== "function") return;
  __actions.set(key, fn);
}

export function uiClearActions() {
  __actions.clear();
}

/* =========================
   TAP / CLICK DELEGATION (iOS-safe)
   - Uses Pointer events to avoid touchend+click double firing
   - Captures early to beat overlays / stopPropagation
   ========================= */
let __tapWired = false;

export function uiWireGlobalTaps({
  routeAttr = "data-route",
  actionAttr = "data-action",
  allowSelectors = ["a", "button", "[role='button']", "[data-route]", "[data-action]"],
  preventDouble = true
} = {}) {
  if (__tapWired) return;
  __tapWired = true;

  // iOS highlight + tap behavior
  try {
    document.body.style.webkitTapHighlightColor = "transparent";
    document.body.style.touchAction = "manipulation";
  } catch {}

  let lastKey = "";
  let lastAt = 0;

  const isTextInput = (el) => {
    const tag = (el?.tagName || "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  };

  const handler = (ev) => {
    // never hijack typing/selection
    if (isTextInput(ev.target)) return;

    const selector = allowSelectors.join(",");
    const target = ev.target?.closest?.(selector);
    if (!target) return;

    // If user clicked something disabled, ignore
    if (target.matches?.("[disabled], .disabled, [aria-disabled='true']")) return;

    const href = (target.getAttribute?.("href") || "").trim();
    const isHashLink = href.startsWith("#");
    const isExternalLink =
      target.tagName === "A" && href && !isHashLink && !href.startsWith("javascript:");

    const route = (
      target.getAttribute?.(routeAttr) ||
      (isHashLink ? href.replace("#", "") : "") ||
      ""
    ).trim().toLowerCase();

    const action = (target.getAttribute?.(actionAttr) || "").trim().toLowerCase();

    // Debounce: prevents double triggers
    if (preventDouble) {
      const key = `${route}|${action}|${target.id || ""}|${target.className || ""}`;
      const now = Date.now();
      if (key === lastKey && (now - lastAt) < 420) {
        ev.preventDefault?.();
        ev.stopPropagation?.();
        return;
      }
      lastKey = key;
      lastAt = now;
    }

    // Allow normal external navigation
    if (isExternalLink && !route && !action) return;

    // Route navigation
    if (route) {
      if (isHashLink || target.tagName !== "A") ev.preventDefault?.();
      uiGo(route);
      return;
    }

    // Custom action
    if (action && __actions.has(action)) {
      ev.preventDefault?.();
      try {
        __actions.get(action)?.(target, ev);
      } catch (e) {
        uiToast(e?.message || String(e));
      }
    }
  };

  // Pointer events = single event path for mobile + desktop
  const usePointer = "PointerEvent" in window;
  if (usePointer) {
    document.addEventListener("pointerup", handler, true);
  } else {
    // fallback
    document.addEventListener("click", handler, true);
  }
}

/* =========================
   OPTIONAL: DRAWER (only if you actually use it)
   ========================= */
let __drawerWired = false;

function lockBodyScroll(lock) {
  if (lock) {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
  } else {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
  }
}

export function uiWireDrawer({
  btnId = "btnMenu",
  sidebarId = "sidebar",
  overlayId = "drawerOverlay",
  closeOnNavSelector = ".nav-item",
  mediaQuery = "(max-width: 920px)"
} = {}) {
  if (__drawerWired) return;

  const btn = document.getElementById(btnId);
  const sidebar = document.getElementById(sidebarId);
  const overlay = document.getElementById(overlayId);

  if (!btn || !sidebar || !overlay) return;
  __drawerWired = true;

  const isMobile = () => window.matchMedia(mediaQuery).matches;

  const open = () => {
    sidebar.classList.add("open");
    overlay.classList.add("show");
    if (isMobile()) lockBodyScroll(true);
  };

  const close = () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
    lockBodyScroll(false);
  };

  btn.addEventListener("click", () => {
    sidebar.classList.contains("open") ? close() : open();
  });

  overlay.addEventListener("click", close);

  document.querySelectorAll(closeOnNavSelector).forEach((a) => {
    a.addEventListener("click", () => {
      if (isMobile()) close();
    });
  });

  window.addEventListener("resize", () => {
    if (!isMobile()) close();
  });

  return { open, close };
}

/* =========================
   EMPTY / SKELETON
   ========================= */
export function uiEmptyState({
  title = "No items yet",
  body = "This section will update automatically once HR posts changes.",
  ctaLabel = "",
  ctaRoute = ""
} = {}) {
  const cta = (ctaLabel && ctaRoute)
    ? `<a class="btn ghost" href="#${escapeHtml(ctaRoute)}" data-route="${escapeHtml(ctaRoute)}"
         style="margin-top:12px;width:100%;text-align:center;border-radius:16px;">
         ${escapeHtml(ctaLabel)}
       </a>`
    : "";

  return `
    <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
      <div style="font-weight:1000;font-size:14px;letter-spacing:.2px;">${escapeHtml(title)}</div>
      <div class="muted" style="margin-top:8px;line-height:1.45;">${escapeHtml(body)}</div>
      ${cta}
    </div>
  `;
}

export function uiSkeletonCard(lines = 3) {
  const n = Math.max(1, Number(lines || 3));
  const row = () => `
    <div style="
      height:12px;border-radius:999px;margin-top:10px;
      background: linear-gradient(90deg, rgba(15,23,42,.06), rgba(15,23,42,.10), rgba(15,23,42,.06));
      background-size: 240% 100%;
      animation: uiSk 1.1s ease-in-out infinite;
    "></div>
  `;

  return `
    <style>
      @keyframes uiSk{
        0%{ background-position: 0% 0; }
        100%{ background-position: 200% 0; }
      }
    </style>
    <div class="card" style="border-radius:18px;">
      ${Array.from({ length: n }, row).join("")}
    </div>
  `;
}

export function uiSetLoading(el, loading = true, lines = 3) {
  if (!el) return;
  el.innerHTML = loading ? uiSkeletonCard(lines) : "";
}

/* =========================
   SMALL BUILDERS
   ========================= */
export function uiPill(text, tone = "default") {
  const tones = {
    default: "background:rgba(15,23,42,.06);border:1px solid rgba(229,234,242,.95);color:inherit;",
    info: "background:rgba(14,165,233,.10);border:1px solid rgba(14,165,233,.20);",
    ok: "background:rgba(22,163,74,.10);border:1px solid rgba(22,163,74,.20);color:var(--good);",
    warn: "background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.22);color:#92400e;",
    bad: "background:rgba(239,68,68,.10);border:1px solid rgba(239,68,68,.20);color:var(--bad);"
  };

  return `
    <span style="
      display:inline-flex;align-items:center;
      padding:7px 10px;border-radius:999px;
      font-size:12px;font-weight:950;
      ${tones[tone] || tones.default}
    ">${escapeHtml(text)}</span>
  `;
}

export function uiRowCard(title, subtitle = "", rightHtml = "") {
  return `
    <div class="rowcard" style="margin-top:10px;">
      <div class="row-top">
        <div style="flex:1;">
          <div class="row-title">${escapeHtml(title)}</div>
          ${subtitle ? `<div class="row-sub">${escapeHtml(subtitle)}</div>` : ""}
        </div>
        ${rightHtml ? `<div class="row-right">${rightHtml}</div>` : ""}
      </div>
    </div>
  `;
}

export function uiSectionHeader(title, right = "") {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
      <div style="font-weight:1000;font-size:14px;letter-spacing:.2px;">${escapeHtml(title)}</div>
      ${right ? `<div class="small muted" style="font-weight:900;">${escapeHtml(right)}</div>` : ""}
    </div>
  `;
/* ✅ FORCE NAV: si tocaste un botón, cambia hash y llama al router */
(function forceBottomNav() {
  const nav = document.getElementById("bottomNav");
  if (!nav) return;

  // Captura taps/clicks incluso si algo intenta bloquear
  nav.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-route]");
    if (!a) return;

    e.preventDefault();
    e.stopPropagation();

    const route = (a.dataset.route || "").trim();
    if (!route) return;

    // 1) Cambia el hash sí o sí
    window.location.hash = route;

    // 2) Si tienes router global, lo llamamos si existe
    if (typeof window.navigate === "function") {
      window.navigate(route);
    }

    // 3) Dispara hashchange manual por si tu app no lo escucha bien
    window.dispatchEvent(new Event("hashchange"));
  }, true);
})();

}
