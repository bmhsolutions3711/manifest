# AI Pulse — Roadmap

**Constraint (non-negotiable):** generation and hosting live in the cloud.  
The MacBook Air does **not** need to be on or online for daily use.  
Phone = read when *you* want. **No notification spam.**

**Identity context:** hotshot trucker + aspiring AI-era entrepreneur.  
Eastern Time for all schedules. Phone-first UI.

---

## Product shape (end state)

```
AI Pulse
├── Pulse       ← MVP: weekday brief + Sunday deep dive + history
├── Library     ← Phase 2: curated books (not thousands)
├── Playbooks   ← Phase 3: founder checklists
└── Watchlist   ← Phase 3: people, pods, communities
```

Data stays **static files in git** (GitHub Pages friendly).  
No server SQLite. Markdown + JSON *are* the database.

---

## Phase 0 — Done (scaffold)

- [x] Mobile-first static reader (`index.html`, history list, detail view)
- [x] `briefings/*.md` + `briefings/index.json` history store
- [x] Cloud generator script (`scripts/generate_briefing.py`)
- [x] GitHub Actions schedule (weekdays + Sunday, ET-oriented UTC cron)
- [x] Service worker (re-read after open once, even if signal drops)
- [x] Roadmap + Library schema stubs (this doc + `library/`)

---

## Phase 1 — MVP (ship & habit) ← **you are here**

**Goal:** Open the site at a fuel stop for 5 consecutive days without friction.

### Ship checklist

- [ ] Push repo to GitHub as `ai-pulse`
- [ ] Enable GitHub Pages (Actions deploy workflow)
- [ ] Run **Generate AI Pulse briefing** once manually (Actions → Run workflow)
- [ ] Optional: set repo secret `XAI_API_KEY` for LLM-polished briefs
- [ ] Phone: open site → Share → **Add to Home Screen**
- [ ] Pause/delete Grok *notification* automations (this site replaces them)
- [ ] Confirm weekday + Sunday runs appear in history after first week

### MVP success criteria

1. Air can be off all day — briefs still appear after Actions run.
2. History scrolls; past days open with real links.
3. You choose when to open it (no push pings required).
4. Quiet news days still produce a short, honest digest (no padding).

### Explicitly out of MVP

- Library UI, playbooks UI, user accounts, comments
- Thousands of books, full-text book storage
- Local Radar/Forge/Ollama dependency for road use

---

## Phase 2 — Library (curated learning)

**Start only after** Phase 1 habit is real (≈1 week of road use).

**Goal:** 8–15 books max that an AI-era founder actually needs — not a bookstore.

### Data (already stubbed)

- `library/books.json` — catalog + status
- `library/notes/` — optional one-pager per book later

### Each book record

| Field | Purpose |
|-------|---------|
| `id` | stable slug |
| `title` / `author` | identity |
| `lane` | `build` · `sell` · `ops` · `ai-literacy` · `markets` · `mindset` |
| `why` | why *you* (trucker-founder), 1–2 sentences |
| `when` | when to read (stage) |
| `status` | `queued` · `reading` · `done` · `skipped` |
| `action` | one experiment after reading |
| `links` | buy / free / summary (optional) |

### UX (Phase 2 build)

- [ ] Tab or section: **Library** next to history
- [ ] Filter by lane / status
- [ ] Sunday deep dive: optional “Library pick of the week” (one idea, not a new book every week)
- [ ] Still static JSON — edit at home or via PR; no app backend required

### Book policy

- Cap soft-limit **15** on the active shelf.
- Add one → remove or archive one.
- Prefer *finish and apply* over collect.

---

## Phase 3 — Founder knowledge funnels

**After** Library is useful, not decorative.

### Playbooks (`playbooks/` — not created until Phase 3)

Short markdown checklists, phone-scannable:

- Wedge & ICP (especially **logistics / freight / SMB ops** — unfair edge)
- First 10 customers
- Pricing & packaging AI products
- Build vs buy (models, infra, tools)
- Trust, safety, and “don’t ship embarrassing AI”
- Capital: when to ignore VCs vs when numbers force the conversation

### Watchlist (`watchlist/` — Phase 3)

- 10–20 people (not 200)
- 3–5 podcasts / YouTube series worth drive time
- 2–3 communities (builder + founder + optional vertical)
- Living “rooms” — Spaces, conferences — only when high signal

### Opportunity radar

- Notes tying AI capability → pain you already see on the road
- Update monthly, not daily (avoid second newsfeed)

---

## Knowledge funnels map (target, not all built)

| Funnel | Cadence | Phase | Vehicle |
|--------|---------|-------|---------|
| Situation awareness | Daily / weekly | 1 | Pulse briefings |
| Mental models | Slow / deep | 2 | Library books |
| Skills (build/sell/ops) | Weekly pick | 2–3 | Brief “for builders” + playbooks |
| People & rooms | Weekly | 3 | Watchlist |
| Opportunity | Monthly | 3 | Playbook + notes |
| Capital & policy | As needed | 1+3 | Pulse business section + playbook |

---

## Non-goals (protect focus)

- Not Google News.
- Not “summarize the entire internet.”
- Not a second Twitter.
- Not dependent on home Wi‑Fi or the Air for generation.
- Not notification-driven (email optional later; default is pull).

---

## Decision log

| Date | Decision |
|------|----------|
| 2026-08-10 | GitHub Pages + markdown history over server SQLite |
| 2026-08-10 | Eastern Time anchor for multi-zone trucking |
| 2026-08-10 | MVP Pulse first; Library schema only until habit sticks |
| 2026-08-10 | Books capped ~8–15; curation is the product |
| 2026-08-10 | Cloud GitHub Actions for generation (Air out of loop) |

---

## Next action (right now)

1. `git push` this repo and turn on Pages (see root `README.md`).
2. Run one cloud briefing from Actions.
3. Use Pulse on the phone for a week.
4. Only then open Phase 2 Library UI work.
