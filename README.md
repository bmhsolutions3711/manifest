# AI Pulse

**AI briefings for the road.** Open on your phone when *you* want. History included.  
**No notifications. No MacBook Air required** for daily use.

| You | What happens |
|-----|----------------|
| On the road, Air off | Site still works — **GitHub Pages** |
| Want today’s brief | Open the site (cellular). Pull, don’t push. |
| Want last Tuesday | Scroll **history** |
| Generation | **GitHub Actions** in the cloud (Eastern-oriented schedule) |

Roadmap (MVP → Library → Founder funnels): **[docs/ROADMAP.md](docs/ROADMAP.md)**  
Library schema only (no UI yet): **[library/](library/)**

---

## Why not SQLite?

GitHub Pages = **static files only**.  
`briefings/*.md` + `briefings/index.json` **are** the database (history included, git-backed, free).

---

## Deploy checklist (MVP)

### 1. Create GitHub repo and push

```bash
cd ~/ai-pulse
git init
git add .
git commit -m "feat: AI Pulse MVP — reader, cloud generator, library schema"
git branch -M main
# Create empty public repo "ai-pulse" on GitHub, then:
git remote add origin git@github.com:YOUR_USER/ai-pulse.git
git push -u origin main
```

### 2. Enable Pages

1. Repo → **Settings → Pages**
2. **Source:** GitHub Actions  
3. After the **Deploy to GitHub Pages** workflow runs, open the printed URL  
   (usually `https://YOUR_USER.github.io/ai-pulse/`)

### 3. Cloud briefings (Air never involved)

1. **Settings → Secrets and variables → Actions**
2. Optional: secret **`XAI_API_KEY`**  
   - Without key: RSS digest from solid AI feeds  
   - With key: LLM-polished mobile brief via xAI
3. **Actions → Generate AI Pulse briefing → Run workflow** (test once)
4. Schedule (UTC cron, morning Eastern):
   - Mon–Fri → weekday brief  
   - Sunday → deep dive  

### 4. Phone

1. Open the Pages URL on your phone  
2. Safari → **Share → Add to Home Screen**  
3. Leave system notifications off — this app doesn’t need them  

### 5. Kill the old ping path

Pause or delete Grok Automations that emailed/notified morning briefs.  
**AI Pulse replaces that loop.**

---

## Local test (home only — not for road)

```bash
cd ~/ai-pulse
python3 scripts/generate_briefing.py --type weekday
python3 -m http.server 8765
# http://127.0.0.1:8765
```

macOS Python SSL tip: `python3 -m pip install --user certifi` if feeds fail locally.  
GitHub Actions Ubuntu does not need that.

---

## Architecture

```
GitHub Actions (schedule)
  scripts/generate_briefing.py
    → RSS (+ optional xAI)
    → briefings/*.md + index.json
    → commit + push
         ↓
GitHub Pages (static)
  index.html / app.js / briefings/*
         ↓  cellular when YOU open it
    Phone (Add to Home Screen)
```

**Nothing in this loop requires the Air.**

---

## Repo map

| Path | Role |
|------|------|
| `index.html` `app.js` `styles.css` | Phone reader |
| `briefings/` | History (markdown + index) |
| `scripts/generate_briefing.py` | Cloud generator |
| `.github/workflows/` | Generate + deploy |
| `library/books.json` | Phase 2 shelf (schema only) |
| `docs/ROADMAP.md` | MVP → Library → Playbooks |

---

## Phase reminder

1. **MVP** — ship + use Pulse for a week on the road  
2. **Library UI** — only after that habit sticks  
3. **Playbooks / watchlist** — founder funnels after Library  

See [docs/ROADMAP.md](docs/ROADMAP.md).
