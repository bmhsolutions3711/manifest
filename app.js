/* AI Pulse — static reader. Works on GitHub Pages. No server. No Air. */

const INDEX_URL = "briefings/index.json";
const CACHE_NAME = "ai-pulse-v1";

const state = {
  items: [],
  filter: "all",
  currentId: null,
};

const $ = (sel) => document.querySelector(sel);
const listEl = $("#list");
const statusEl = $("#status");
const listView = $("#list-view");
const detailView = $("#detail-view");
const detailBody = $("#detail-body");
const btnBack = $("#btn-back");
const btnRefresh = $("#btn-refresh");
const btnOpenRaw = $("#btn-open-raw");

function setStatus(msg, isError = false) {
  statusEl.textContent = msg || "";
  statusEl.classList.toggle("error", !!isError);
}

function formatDate(iso) {
  try {
    const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    });
  } catch {
    return iso;
  }
}

function applyFilter(items) {
  if (state.filter === "all") return items;
  return items.filter((i) => i.type === state.filter);
}

function renderList() {
  const items = applyFilter(state.items);
  if (!items.length) {
    listEl.innerHTML = `<div class="empty">No briefings yet${
      state.filter !== "all" ? " for this filter" : ""
    }.<br/>Cloud generator will fill this once Actions runs.</div>`;
    return;
  }

  listEl.innerHTML = items
    .map(
      (item) => `
    <button type="button" class="card" data-id="${escapeAttr(item.id)}">
      <div class="card-top">
        <span class="badge ${escapeAttr(item.type)}">${escapeHtml(
          item.type === "sunday" ? "Sunday deep dive" : "Weekday"
        )}</span>
        <span class="card-date">${escapeHtml(formatDate(item.date))}</span>
      </div>
      <h2>${escapeHtml(item.title)}</h2>
      <p>${escapeHtml(item.summary || "")}</p>
    </button>`
    )
    .join("");

  listEl.querySelectorAll(".card").forEach((btn) => {
    btn.addEventListener("click", () => openBriefing(btn.dataset.id));
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

async function loadIndex() {
  setStatus(navigator.onLine ? "Loading…" : "Offline — showing cache if any…");
  try {
    const res = await fetch(INDEX_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`index ${res.status}`);
    const data = await res.json();
    state.items = (data.briefings || []).slice().sort((a, b) => {
      // newest first
      return String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id));
    });
    setStatus(
      state.items.length
        ? `${state.items.length} briefing${state.items.length === 1 ? "" : "s"} · ET schedule`
        : "History empty — waiting for first cloud run"
    );
    renderList();
  } catch (err) {
    console.error(err);
    setStatus("Could not load history. Check connection or try again.", true);
    listEl.innerHTML = `<div class="empty">Failed to load briefings/index.json</div>`;
  }
}

async function openBriefing(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;

  state.currentId = id;
  listView.hidden = true;
  detailView.hidden = false;
  detailBody.innerHTML = `<p class="status">Loading…</p>`;
  btnOpenRaw.href = item.file;
  window.scrollTo(0, 0);

  try {
    const res = await fetch(item.file, { cache: "force-cache" });
    if (!res.ok) throw new Error(`file ${res.status}`);
    const md = await res.text();

    if (typeof marked !== "undefined") {
      marked.setOptions({ gfm: true, breaks: true });
      detailBody.innerHTML = marked.parse(md);
    } else {
      detailBody.innerHTML = `<pre style="white-space:pre-wrap">${escapeHtml(md)}</pre>`;
    }

    // Make external links open in new tab (phone-friendly)
    detailBody.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (href.startsWith("http")) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      }
    });

    // Cache this page's assets + markdown for next offline open
    if ("caches" in window) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.add(item.file);
      } catch (_) {
        /* ignore */
      }
    }
  } catch (err) {
    console.error(err);
    detailBody.innerHTML = `<p class="status error">Could not open this briefing. If you're offline, open it once while online so it caches.</p>`;
  }
}

function showList() {
  state.currentId = null;
  detailView.hidden = true;
  listView.hidden = false;
  window.scrollTo(0, 0);
}

function bindUi() {
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.filter = chip.dataset.filter;
      renderList();
    });
  });

  btnBack.addEventListener("click", showList);
  btnRefresh.addEventListener("click", () => loadIndex());

  window.addEventListener("online", () => {
    setStatus("Back online");
    loadIndex();
  });
  window.addEventListener("offline", () => {
    setStatus("Offline — previously opened briefings may still work", true);
  });

  // Deep link: ?id=2026-08-11-weekday
  const params = new URLSearchParams(location.search);
  const deepId = params.get("id");
  loadIndex().then(() => {
    if (deepId) openBriefing(deepId);
  });
}

function registerSw() {
  if (!("serviceWorker" in navigator)) return;
  // Only register when served over http(s) — not file://
  if (!/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register("sw.js").catch((err) => {
    console.warn("SW register failed", err);
  });
}

bindUi();
registerSw();
