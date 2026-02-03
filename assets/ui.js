// assets/ui.js
// Amazon-ish UI helpers (no framework)
// ✅ Toast queue (no overlap)
// ✅ Active nav works with href="#route" OR data-route="route"
// ✅ Mobile drawer helpers (open/close + overlay + lock body scroll)
// ✅ Skeleton / empty-state helpers (so it never looks "vacío")
// ✅ Small UI builders (badge, pill, rows)

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
   TOAST (premium queue)
   ========================= */
let __toastEl = null;
let __toastHideTimer = null;

export function uiToast(text, ms = 2200) {
  const msg = String(text ?? "").trim();
  if (!msg) return;

  // Ensure single toast node (app feel)
  if (!__toastEl) {
    __toastEl = document.createElement("div");
    __toastEl.className = "toast";
    document.body.appendChild(__toastEl);
  }

  // Reset timers
  if (__toastHideTimer) clearTimeout(__toastHideTimer);

  __toastEl.textContent = msg;

  // Show
  requestAnimationFrame(() => __toastEl.classList.add("show"));

  // Hide
  __toastHideTimer = setTimeout(() => {
    __toastEl?.classList.remove("show");
  }, ms);
}

/* =========================
   ACTIVE NAV (works with your HTML)
   - Supports:
     <a class="nav-item" href="#progress">
     OR <a class="nav-item" data-route="progress" href="#progress">
   ========================= */
export function uiActiveNav() {
  const route = (location.hash || "#progress").replace("#", "").trim().toLowerCase();

  document.querySelectorAll(".nav-item").forEach((a) => {
    const r1 = (a.getAttribute("data-route") || "").trim().toLowerCase();
    const href = (a.getAttribute("href") || "").trim();
    const r2 = href.startsWith("#") ? href.replace("#", "").trim().toLowerCase() : "";

    const match = (r1 && r1 === route) || (r2 && r2 === route);
    a.classList.toggle("active", !!match);
  });
}

/* =========================
   MOBILE DRAWER (App feel)
   ========================= */
let __drawerWired = false;

function lockBodyScroll(lock) {
  // Prevent background scroll when drawer open (mobile)
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

/**
 * Call once from your page init (employee.js already has a version,
 * but this is here so the UI layer is complete).
 */
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
    // If user rotates / goes desktop, close drawer and unlock
    if (!isMobile()) close();
  });

  // expose helpers (optional)
  return { open, close };
}

/* =========================
   SKELETONS / EMPTY STATES
   ========================= */

export function uiEmptyState(title = "Nothing here yet", body = "This section will populate once HR posts updates.", emoji = "📌") {
  return `
    <div class="card" style="border-radius:18px;box-shadow: 0 14px 30px rgba(15,23,42,.06);">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <div style="
          width:40px;height:40px;border-radius:16px;
          display:flex;align-items:center;justify-content:center;
          background:rgba(29,78,216,.10);
          font-size:18px;
        ">${escapeHtml(emoji)}</div>
        <div style="flex:1;">
          <div style="font-weight:1000;font-size:14px;">${escapeHtml(title)}</div>
          <div class="muted" style="margin-top:6px;line-height:1.45;">${escapeHtml(body)}</div>
        </div>
      </div>
    </div>
  `;
}

// Lightweight skeleton block (no CSS dependency)
export function uiSkeletonCard(lines = 3) {
  const row = () => `
    <div style="
      height:12px;
      border-radius:999px;
      background: linear-gradient(90deg,
        rgba(15,23,42,.06),
        rgba(15,23,42,.10),
        rgba(15,23,42,.06)
      );
      background-size: 240% 100%;
      animation: sk 1.1s ease-in-out infinite;
      margin-top:10px;
    "></div>
  `;

  const l = Array.from({ length: Math.max(1, lines) }, () => row()).join("");

  return `
    <style>
      @keyframes sk{
        0%{ background-position: 0% 0; }
        100%{ background-position: 200% 0; }
      }
    </style>
    <div class="card" style="border-radius:18px;">
      ${l}
    </div>
  `;
}

export function uiSetLoading(el, loading = true, lines = 3) {
  if (!el) return;
  el.innerHTML = loading ? uiSkeletonCard(lines) : "";
}

/* =========================
   SMALL UI BUILDERS (app-y)
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
    <div style="
      display:flex;justify-content:space-between;gap:12px;align-items:flex-start;
      padding:12px;border-radius:18px;
      border:1px solid rgba(229,234,242,.98);
      background:rgba(255,255,255,.95);
      box-shadow: var(--shadow2);
      margin-top:10px;
    ">
      <div style="flex:1;">
        <div style="font-weight:950;font-size:13px;line-height:1.25;">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="muted" style="margin-top:6px;font-size:12px;line-height:1.35;">${escapeHtml(subtitle)}</div>` : ""}
      </div>
      ${rightHtml ? `<div>${rightHtml}</div>` : ""}
    </div>
  `;
}

export function uiSectionHeader(title, right = "") {
  return `
    <div style="
      display:flex;justify-content:space-between;align-items:center;
      gap:10px;flex-wrap:wrap;margin-bottom:10px;
    ">
      <div style="font-weight:1000;font-size:14px;letter-spacing:.2px;">${escapeHtml(title)}</div>
      ${right ? `<div class="small muted" style="font-weight:900;">${escapeHtml(right)}</div>` : ""}
    </div>
  `;
}

/* =========================
   ROUTE HELPERS
   ========================= */
export function uiRoute() {
  return (location.hash || "#progress").replace("#", "").trim().toLowerCase();
}

export function uiGo(route) {
  const r = String(route || "").replace("#", "").trim().toLowerCase();
  location.hash = "#" + (r || "progress");
}
