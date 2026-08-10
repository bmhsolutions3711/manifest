/* Manifest — ADHD-first reader. Drive mode + listen summary. Static / Pages. */

const INDEX_URL = "briefings/index.json";
const CACHE_NAME = "manifest-v2";
const DONE_KEY = "manifest-done-v1";

const state = {
  items: [],
  filter: "all",
  currentId: null,
  mode: "drive", // drive | deep
  parsed: null,
  md: "",
  speaking: false,
  speakIndex: -1,
};

const $ = (sel) => document.querySelector(sel);
const listEl = $("#list");
const statusEl = $("#status");
const listView = $("#list-view");
const detailView = $("#detail-view");
const detailBody = $("#detail-body");
const driveView = $("#drive-view");
const detailHero = $("#detail-hero");
const btnBack = $("#btn-back");
const btnRefresh = $("#btn-refresh");
const btnListen = $("#btn-listen");
const btnStop = $("#btn-stop");
const playerBar = $("#player-bar");
const playerLabel = $("#player-label");

const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

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

function stripMd(s) {
  return String(s || "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinks(line) {
  const links = [];
  const re = /\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
  let m;
  while ((m = re.exec(line))) {
    links.push({ label: m[1], url: m[2] });
  }
  return links;
}

function loadDoneMap() {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveDoneMap(map) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(map));
  } catch (_) {
    /* private mode */
  }
}

function doneSetFor(id) {
  const map = loadDoneMap();
  return new Set(map[id] || []);
}

function toggleDone(briefId, storyKey) {
  const map = loadDoneMap();
  const arr = new Set(map[briefId] || []);
  if (arr.has(storyKey)) arr.delete(storyKey);
  else arr.add(storyKey);
  map[briefId] = [...arr];
  saveDoneMap(map);
  return arr;
}

/**
 * Pull ADHD-friendly structure out of our briefing markdown.
 */
function parseBrief(md) {
  const lines = md.split(/\r?\n/);
  let title = "Briefing";
  for (const line of lines) {
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
      break;
    }
  }

  const sections = {};
  let current = null;
  let buf = [];

  const flush = () => {
    if (current) sections[current] = buf.join("\n").trim();
    buf = [];
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      flush();
      current = h2[1].trim().toLowerCase();
      continue;
    }
    if (current) buf.push(line);
  }
  flush();

  const findSection = (...names) => {
    for (const n of names) {
      const key = Object.keys(sections).find((k) => k.includes(n));
      if (key) return sections[key];
    }
    return "";
  };

  const scanRaw = findSection("60-second", "scan", "90 second", "week in");
  const scan = [];
  for (const line of scanRaw.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("- ") && !t.startsWith("* ")) continue;
    const body = t.replace(/^[-*]\s+/, "");
    const links = extractLinks(body);
    scan.push({
      text: stripMd(body),
      links,
      url: links[0]?.url || "",
    });
  }

  // Prefer explicit ## Speak block when generator provides it
  const speakRaw = findSection("speak");
  let speakLines = null;
  if (speakRaw) {
    const fromBlock = speakRaw
      .split("\n")
      .map((l) => stripMd(l))
      .filter((l) => l && !l.startsWith("---"));
    // Merge prose paragraphs + numbered lines into utterance chunks
    if (fromBlock.length) {
      speakLines = [];
      for (const line of fromBlock) {
        if (/^\d+\./.test(line) || speakLines.length === 0) speakLines.push(line);
        else if (line.length < 40 && speakLines.length) speakLines[speakLines.length - 1] += " " + line;
        else speakLines.push(line);
      }
    }
  }

  const storiesRaw = findSection("top stories", "big arcs");
  const stories = [];
  let story = null;
  for (const line of storiesRaw.split("\n")) {
    const h3 = line.match(/^###\s+(?:\d+\.\s*)?(.+)/);
    if (h3) {
      if (story) stories.push(story);
      story = {
        title: stripMd(h3[1]),
        why: "",
        links: [],
        confidence: "",
      };
      continue;
    }
    if (!story) continue;
    const t = line.trim();
    if (/why it matters/i.test(t)) {
      story.why = stripMd(t.replace(/^[-*]\s*\*\*Why it matters:\*\*\s*/i, "").replace(/^[-*]\s*Why it matters:\s*/i, ""));
    } else if (/links?:/i.test(t) || /\[/.test(t)) {
      story.links.push(...extractLinks(t));
    } else if (/confidence/i.test(t)) {
      story.confidence = stripMd(t.replace(/^[-*]\s*\*\*Confidence:\*\*\s*/i, ""));
    }
  }
  if (story) stories.push(story);

  // If no structured stories, promote scan items
  if (!stories.length && scan.length) {
    scan.forEach((s, i) => {
      stories.push({
        title: s.text,
        why: "",
        links: s.links,
        confidence: "",
      });
    });
  }

  const watchRaw = findSection("watch / listen", "watch", "listen");
  const watch = [];
  for (const line of watchRaw.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("- ")) continue;
    const links = extractLinks(t);
    if (!links.length) continue;
    watch.push({
      title: stripMd(t.replace(/^[-*]\s+/, "")),
      url: links[0].url,
    });
  }

  const closeRaw = findSection("close");
  let oneTap = null;
  for (const line of closeRaw.split("\n")) {
    if (/one tap|one thing|only open one/i.test(line)) {
      const links = extractLinks(line);
      if (links[0]) {
        oneTap = { label: stripMd(links[0].label), url: links[0].url };
      }
    }
  }
  if (!oneTap && stories[0]?.links[0]) {
    oneTap = {
      label: stories[0].title.slice(0, 80),
      url: stories[0].links[0].url,
    };
  }

  // Spoken script: short, not every word (fallback if no ## Speak)
  if (!speakLines) {
    const bullets = (scan.length ? scan : stories).slice(0, 5);
    speakLines = [
      `Manifest. ${title.replace(/^AI Brief[—–-]\s*/i, "").replace(/\s*ET\s*$/i, "")}.`,
      bullets.length
        ? `${bullets.length} things worth your attention.`
        : "Quiet day. Nothing critical.",
    ];
    bullets.forEach((b, i) => {
      const bit = typeof b.text === "string" ? b.text : b.title;
      const short = bit.length > 140 ? bit.slice(0, 137) + "…" : bit;
      speakLines.push(`${i + 1}. ${short}`);
    });
    if (oneTap?.label) {
      speakLines.push(`If you only open one thing: ${oneTap.label}.`);
    }
    speakLines.push("That's the load. Manifest out.");
  }

  return {
    title,
    scan,
    stories: stories.slice(0, 8),
    watch: watch.slice(0, 5),
    oneTap,
    speakLines,
    speakText: speakLines.join(" "),
  };
}

function applyFilter(items) {
  if (state.filter === "all") return items;
  return items.filter((i) => i.type === state.filter);
}

function progressFor(id, storyCount) {
  const done = doneSetFor(id);
  let n = 0;
  for (let i = 0; i < storyCount; i++) {
    if (done.has(String(i))) n++;
  }
  return { done: n, total: storyCount };
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
    .map((item) => {
      // We don't know story count until open; show done if any
      const doneMap = loadDoneMap()[item.id] || [];
      const prog =
        doneMap.length > 0
          ? `${doneMap.length} checked`
          : item.type === "sunday"
            ? "Deep dive"
            : "Drive mode ready";
      return `
    <div class="card" data-id="${escapeAttr(item.id)}" role="button" tabindex="0">
      <div class="card-top">
        <span class="badge ${escapeAttr(item.type)}">${escapeHtml(
          item.type === "sunday" ? "Sunday" : "Weekday"
        )}</span>
        <span class="card-date">${escapeHtml(formatDate(item.date))}</span>
      </div>
      <h2>${escapeHtml(item.title)}</h2>
      <p>${escapeHtml(item.summary || "")}</p>
      <div class="card-foot">
        <span class="progress-mini">${escapeHtml(prog)}</span>
        <button type="button" class="btn-quick-listen" data-listen-id="${escapeAttr(
          item.id
        )}" ${canSpeak ? "" : "disabled"}>▶ Summary</button>
      </div>
    </div>`;
    })
    .join("");

  listEl.querySelectorAll(".card").forEach((card) => {
    const open = () => openBriefing(card.dataset.id);
    card.addEventListener("click", (e) => {
      if (e.target.closest(".btn-quick-listen")) return;
      open();
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });

  listEl.querySelectorAll(".btn-quick-listen").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.listenId;
      await openBriefing(id, { autoListen: true });
    });
  });
}

async function loadIndex() {
  setStatus(navigator.onLine ? "Loading…" : "Offline — showing cache if any…");
  try {
    const res = await fetch(INDEX_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`index ${res.status}`);
    const data = await res.json();
    state.items = (data.briefings || []).slice().sort((a, b) => {
      return (
        String(b.date).localeCompare(String(a.date)) ||
        String(b.id).localeCompare(String(a.id))
      );
    });
    setStatus(
      state.items.length
        ? `${state.items.length} briefing${state.items.length === 1 ? "" : "s"} · tap Summary to listen`
        : "History empty — waiting for first cloud run"
    );
    renderList();
  } catch (err) {
    console.error(err);
    setStatus("Could not load history. Check connection or try again.", true);
    listEl.innerHTML = `<div class="empty">Failed to load briefings/index.json</div>`;
  }
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode-chip").forEach((c) => {
    const on = c.dataset.mode === mode;
    c.classList.toggle("active", on);
    c.setAttribute("aria-selected", on ? "true" : "false");
  });
  driveView.hidden = mode !== "drive";
  detailBody.hidden = mode !== "deep";
}

function renderDrive() {
  const p = state.parsed;
  if (!p) return;
  const id = state.currentId;
  const done = doneSetFor(id);
  const stories = p.stories;
  const { done: dCount, total } = progressFor(id, stories.length);

  const track = stories
    .map((_, i) => `<i class="${done.has(String(i)) ? "on" : ""}"></i>`)
    .join("");

  const storyCards = stories
    .map((s, i) => {
      const key = String(i);
      const isDone = done.has(key);
      const isActive = state.speaking && state.speakIndex === i + 2; // offset for intro lines
      const link = s.links[0];
      return `
      <article class="story-card ${isDone ? "is-done" : ""} ${isActive ? "is-active" : ""}" data-story="${i}">
        <div class="story-head">
          <div class="story-num">${isDone ? "✓" : i + 1}</div>
          <h3 class="story-title">${escapeHtml(s.title)}</h3>
        </div>
        ${s.why ? `<p class="story-why">${escapeHtml(s.why)}</p>` : ""}
        <div class="story-actions">
          ${
            link
              ? `<a class="open-link" href="${escapeAttr(
                  link.url
                )}" target="_blank" rel="noopener noreferrer">Open →</a>`
              : ""
          }
          <button type="button" class="btn-done ${isDone ? "checked" : ""}" data-done="${i}">
            ${isDone ? "✓ Checked" : "Mark done"}
          </button>
        </div>
      </article>`;
    })
    .join("");

  const watch =
    p.watch.length > 0
      ? `<p class="lane-label">Watch / listen</p>
         <div class="watch-row">
           ${p.watch
             .map(
               (w) => `
             <a class="watch-item" href="${escapeAttr(
               w.url
             )}" target="_blank" rel="noopener noreferrer">
               <span class="yt">PLAY</span>
               <span>${escapeHtml(w.title.slice(0, 100))}</span>
             </a>`
             )
             .join("")}
         </div>`
      : "";

  const oneTap = p.oneTap
    ? `<div class="one-tap">
         <p class="lane-label">If you only open one thing</p>
         <a href="${escapeAttr(p.oneTap.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
           p.oneTap.label
         )}</a>
       </div>`
    : "";

  driveView.innerHTML = `
    <p class="lane-label">Your load · ${dCount}/${total || stories.length} checked</p>
    <div class="progress-track" aria-hidden="true">${track || "<i></i>"}</div>
    ${storyCards || `<div class="empty">Nothing to skim — try Deep dive.</div>`}
    ${oneTap}
    ${watch}
    <p class="tts-note">${
      canSpeak
        ? "Listen reads a short summary only — not the whole brief."
        : "Voice not available in this browser."
    }</p>
  `;

  driveView.querySelectorAll(".btn-done").forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleDone(id, String(btn.dataset.done));
      renderDrive();
      renderList();
    });
  });
}

function renderHero(item) {
  const p = state.parsed;
  const { done, total } = progressFor(item.id, p.stories.length);
  detailHero.innerHTML = `
    <h2>${escapeHtml(p.title)}</h2>
    <div class="hero-meta">
      <span class="badge ${escapeAttr(item.type)}">${escapeHtml(
        item.type === "sunday" ? "Sunday" : "Weekday"
      )}</span>
      <span class="pill">${escapeHtml(formatDate(item.date))}</span>
      <span class="pill ${done === total && total ? "done" : ""}">${done}/${total} done</span>
      <span class="pill">~1 min listen</span>
    </div>
  `;
}

function stopSpeaking() {
  if (canSpeak) window.speechSynthesis.cancel();
  state.speaking = false;
  state.speakIndex = -1;
  btnListen.hidden = false;
  btnListen.classList.remove("playing");
  btnListen.textContent = "▶ Listen";
  btnStop.hidden = true;
  playerBar.hidden = true;
  playerBar.classList.remove("hot");
  if (state.mode === "drive") renderDrive();
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  // Prefer English, slightly premium system voices when available
  const prefer = [
    /samantha/i,
    /karen/i,
    /moira/i,
    /google us english/i,
    /english.*united states/i,
    /en-us/i,
  ];
  for (const re of prefer) {
    const v = voices.find((x) => re.test(x.name) || re.test(x.lang));
    if (v) return v;
  }
  return voices.find((v) => /^en/i.test(v.lang)) || voices[0];
}

function speakSummary() {
  if (!canSpeak || !state.parsed) return;
  stopSpeaking();

  const lines = state.parsed.speakLines;
  const voice = pickVoice();
  let i = 0;
  state.speaking = true;
  btnListen.classList.add("playing");
  btnListen.textContent = "Playing…";
  btnStop.hidden = false;
  playerBar.hidden = false;
  playerBar.classList.add("hot");

  const next = () => {
    if (!state.speaking || i >= lines.length) {
      stopSpeaking();
      playerLabel.textContent = "Summary done.";
      playerBar.hidden = false;
      playerBar.classList.remove("hot");
      setTimeout(() => {
        if (!state.speaking) playerBar.hidden = true;
      }, 2000);
      return;
    }
    state.speakIndex = i;
    playerLabel.textContent = lines[i].length > 80 ? lines[i].slice(0, 77) + "…" : lines[i];
    if (state.mode === "drive") renderDrive();

    const u = new SpeechSynthesisUtterance(lines[i]);
    u.rate = 1.05;
    u.pitch = 1;
    u.volume = 1;
    if (voice) u.voice = voice;
    u.onend = () => {
      i += 1;
      next();
    };
    u.onerror = () => {
      i += 1;
      next();
    };
    window.speechSynthesis.speak(u);
  };

  // Chrome often needs voices loaded async
  const start = () => next();
  if (window.speechSynthesis.getVoices().length) start();
  else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      start();
    };
    // Fallback if event never fires
    setTimeout(start, 250);
  }
}

async function openBriefing(id, opts = {}) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;

  stopSpeaking();
  state.currentId = id;
  listView.hidden = true;
  detailView.hidden = false;
  driveView.innerHTML = `<p class="status">Loading…</p>`;
  detailBody.innerHTML = "";
  setMode("drive");
  window.scrollTo(0, 0);

  try {
    const res = await fetch(item.file, { cache: "force-cache" });
    if (!res.ok) throw new Error(`file ${res.status}`);
    const md = await res.text();
    state.md = md;
    state.parsed = parseBrief(md);

    renderHero(item);
    renderDrive();

    if (typeof marked !== "undefined") {
      marked.setOptions({ gfm: true, breaks: true });
      detailBody.innerHTML = marked.parse(md);
      detailBody.querySelectorAll("a[href]").forEach((a) => {
        const href = a.getAttribute("href") || "";
        if (href.startsWith("http")) {
          a.setAttribute("target", "_blank");
          a.setAttribute("rel", "noopener noreferrer");
        }
      });
    } else {
      detailBody.innerHTML = `<pre style="white-space:pre-wrap">${escapeHtml(md)}</pre>`;
    }

    if ("caches" in window) {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.add(item.file);
      } catch (_) {
        /* ignore */
      }
    }

    if (opts.autoListen) speakSummary();
  } catch (err) {
    console.error(err);
    driveView.innerHTML = `<p class="status error">Could not open this briefing. Open once online so it caches.</p>`;
  }
}

function showList() {
  stopSpeaking();
  state.currentId = null;
  state.parsed = null;
  detailView.hidden = true;
  listView.hidden = false;
  window.scrollTo(0, 0);
  renderList();
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

  document.querySelectorAll(".mode-chip").forEach((chip) => {
    chip.addEventListener("click", () => setMode(chip.dataset.mode));
  });

  btnBack.addEventListener("click", showList);
  btnRefresh.addEventListener("click", () => loadIndex());
  btnListen.addEventListener("click", () => {
    if (state.speaking) stopSpeaking();
    else speakSummary();
  });
  btnStop.addEventListener("click", stopSpeaking);

  // Stop speech when leaving the page
  window.addEventListener("pagehide", stopSpeaking);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopSpeaking();
  });

  window.addEventListener("online", () => {
    setStatus("Back online");
    loadIndex();
  });
  window.addEventListener("offline", () => {
    setStatus("Offline — previously opened briefings may still work", true);
  });

  if (canSpeak) {
    window.speechSynthesis.getVoices();
  }

  const params = new URLSearchParams(location.search);
  const deepId = params.get("id");
  loadIndex().then(() => {
    if (deepId) openBriefing(deepId);
  });
}

function registerSw() {
  if (!("serviceWorker" in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register("sw.js").catch((err) => {
    console.warn("SW register failed", err);
  });
}

bindUi();
registerSw();
