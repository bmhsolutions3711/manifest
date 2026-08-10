#!/usr/bin/env python3
"""
Manifest — cloud briefing generator.

Designed for GitHub Actions (or any always-on cloud runner).
Does NOT require the user's laptop / Air to be powered or online.

Modes:
  1) Feed digest (default) — free, RSS/Atom only, no API key
  2) LLM polish — if XAI_API_KEY is set, rewrite into the mobile brief format

Usage:
  python scripts/generate_briefing.py              # auto type by weekday ET
  python scripts/generate_briefing.py --type weekday
  python scripts/generate_briefing.py --type sunday
"""

from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
BRIEFINGS = ROOT / "briefings"
INDEX_PATH = BRIEFINGS / "index.json"
ZONE_ET = ZoneInfo("America/New_York")


def ssl_context() -> ssl.SSLContext:
    """Prefer certifi when present (fixes some macOS Python installs)."""
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        ctx = ssl.create_default_context()
        return ctx

# High-signal AI sources (RSS). No Google News. Direct feeds only.
FEEDS = [
    {"name": "OpenAI Blog", "url": "https://openai.com/blog/rss.xml", "kind": "lab"},
    {"name": "Anthropic", "url": "https://raw.githubusercontent.com/Olshansk/rss-feeds/master/feeds/feed_anthropic_news.xml", "kind": "lab"},
    {"name": "Google DeepMind Blog", "url": "https://deepmind.google/blog/rss.xml", "kind": "lab"},
    {"name": "Hugging Face Blog", "url": "https://huggingface.co/blog/feed.xml", "kind": "lab"},
    {"name": "Simon Willison", "url": "https://simonwillison.net/atom/everything/", "kind": "builder"},
    {"name": "Import AI", "url": "https://importai.substack.com/feed", "kind": "newsletter"},
    # The Batch path changes often; Latent Space is a stable high-signal backup
    {"name": "Latent Space", "url": "https://www.latent.space/feed", "kind": "newsletter"},
    {"name": "Ben's Bites", "url": "https://www.bensbites.com/feed", "kind": "newsletter"},
    {"name": "MIT Tech Review — AI", "url": "https://www.technologyreview.com/topic/artificial-intelligence/feed", "kind": "press"},
    {"name": "Ars Technica", "url": "https://feeds.arstechnica.com/arstechnica/technology-lab", "kind": "press"},
    {"name": "The Verge — AI", "url": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "kind": "press"},
    {"name": "TechCrunch AI", "url": "https://techcrunch.com/category/artificial-intelligence/feed/", "kind": "press"},
    {"name": "HN Frontpage", "url": "https://hnrss.org/frontpage", "kind": "builder"},
    {"name": "Two Minute Papers YT", "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg", "kind": "video"},
    {"name": "Yannic Kilcher YT", "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCZHmQk67mSJgfCCTn7xBfew", "kind": "video"},
    {"name": "AI Explained YT", "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCNJ1Ymd5yFuUPtn21xtRbbw", "kind": "video"},
]

USER_AGENT = "Manifest/1.0 (+https://github.com; know-what-youre-carrying; cloud-only)"
MAX_ITEMS_PER_FEED = 8
MAX_TOTAL_ITEMS = 40
HTTP_TIMEOUT = 25


def now_et() -> datetime:
    return datetime.now(tz=ZONE_ET)


def auto_type(dt: datetime) -> str:
    # Sunday = deep dive
    return "sunday" if dt.weekday() == 6 else "weekday"


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
    )
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT, context=ssl_context()) as resp:
        return resp.read()


def local(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def parse_feed(xml_bytes: bytes, source_name: str, kind: str) -> list[dict]:
    items: list[dict] = []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return items

    # RSS 2.0
    for item in root.iter():
        if local(item.tag) != "item":
            continue
        title = link = summary = pub = ""
        for child in item:
            t = local(child.tag)
            if t == "title" and child.text:
                title = child.text.strip()
            elif t == "link" and child.text:
                link = child.text.strip()
            elif t in ("description", "summary") and child.text:
                summary = re.sub(r"<[^>]+>", "", child.text).strip()[:280]
            elif t == "pubDate" and child.text:
                pub = child.text.strip()
        if title and link:
            items.append(
                {
                    "title": title,
                    "url": link,
                    "summary": summary,
                    "published": pub,
                    "source": source_name,
                    "kind": kind,
                }
            )

    # Atom
    if not items:
        for entry in root.iter():
            if local(entry.tag) != "entry":
                continue
            title = link = summary = pub = ""
            for child in entry:
                t = local(child.tag)
                if t == "title" and (child.text or "").strip():
                    title = (child.text or "").strip()
                elif t == "link":
                    href = child.attrib.get("href", "")
                    rel = child.attrib.get("rel", "alternate")
                    if href and rel in ("alternate", ""):
                        link = href
                elif t in ("summary", "content") and child.text:
                    summary = re.sub(r"<[^>]+>", "", child.text).strip()[:280]
                elif t == "updated" and child.text:
                    pub = child.text.strip()
                elif t == "published" and child.text:
                    pub = child.text.strip()
            if title and link:
                items.append(
                    {
                        "title": title,
                        "url": link,
                        "summary": summary,
                        "published": pub,
                        "source": source_name,
                        "kind": kind,
                    }
                )

    return items[:MAX_ITEMS_PER_FEED]


def parse_date(s: str) -> datetime | None:
    if not s:
        return None
    try:
        return parsedate_to_datetime(s).astimezone(timezone.utc)
    except Exception:
        pass
    try:
        # ISO
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None


def collect_items() -> list[dict]:
    all_items: list[dict] = []
    errors: list[str] = []
    for feed in FEEDS:
        try:
            raw = fetch_bytes(feed["url"])
            got = parse_feed(raw, feed["name"], feed["kind"])
            all_items.extend(got)
            print(f"  ok  {feed['name']}: {len(got)}", file=sys.stderr)
        except Exception as e:
            errors.append(f"{feed['name']}: {e}")
            print(f"  skip {feed['name']}: {e}", file=sys.stderr)

    # Prefer fresher items
    def sort_key(it: dict):
        dt = parse_date(it.get("published") or "")
        return dt or datetime(1970, 1, 1, tzinfo=timezone.utc)

    all_items.sort(key=sort_key, reverse=True)

    # Dedupe by URL
    seen: set[str] = set()
    unique: list[dict] = []
    for it in all_items:
        u = it["url"]
        if u in seen:
            continue
        seen.add(u)
        unique.append(it)
        if len(unique) >= MAX_TOTAL_ITEMS:
            break

    if errors:
        print(f"Feed errors: {len(errors)}", file=sys.stderr)
    return unique


def md_link(title: str, url: str) -> str:
    safe = title.replace("[", "(").replace("]", ")")
    return f"[{safe}]({url})"


def build_markdown_feed_only(items: list[dict], brief_type: str, when: datetime) -> str:
    date_label = when.strftime("%a, %b %-d %Y") if sys.platform != "win32" else when.strftime("%a, %b %d %Y")
    # %-d may fail on some platforms — normalize
    date_label = when.strftime("%a, %b %d %Y").replace(" 0", " ")

    title = (
        f"AI Weekly Deep Dive — week of {date_label} ET"
        if brief_type == "sunday"
        else f"AI Brief — {date_label} ET"
    )

    videos = [i for i in items if i["kind"] == "video"][:5]
    newsletters = [i for i in items if i["kind"] == "newsletter"][:6]
    labs = [i for i in items if i["kind"] == "lab"][:6]
    press = [i for i in items if i["kind"] in ("press", "builder")][:12]
    top = (labs + newsletters + press)[:10]

    lines: list[str] = [
        f"# {title}",
        "",
        f"_Cloud-generated · {when.strftime('%Y-%m-%d %H:%M %Z')} · Air not required · ADHD drive-mode ready_",
        "",
        "## 60-second scan",
        "",
    ]

    for it in top[:5]:
        short = it["title"] if len(it["title"]) < 120 else it["title"][:117] + "…"
        lines.append(f"- {short} — **{md_link(it['source'], it['url'])}**")

    if not top:
        lines.append("- Quiet collection window or feeds unreachable — check Actions logs.")

    # Explicit speak script for the phone player (short, not the whole brief)
    lines += ["", "## Speak", ""]
    lines.append(
        f"Manifest. {date_label}. "
        + (
            f"{min(5, len(top))} things worth your attention. "
            if top
            else "Quiet day. "
        )
    )
    for n, it in enumerate(top[:5], 1):
        short = it["title"] if len(it["title"]) < 100 else it["title"][:97] + "…"
        lines.append(f"{n}. {short}")
    if top:
        lines.append(f"If you only open one thing: {top[0]['title'][:80]}.")
    lines.append("That's the load. Manifest out.")

    lines += ["", "## Top stories", ""]
    for n, it in enumerate(top[:8], 1):
        kind_hint = {
            "lab": "Lab drop — primary source",
            "newsletter": "Newsletter signal",
            "press": "Press / industry",
            "builder": "Builder / tools",
            "video": "Video",
        }.get(it["kind"], it["kind"])
        lines += [
            f"### {n}. {it['title']}",
            f"- **Why it matters:** {kind_hint} from {it['source']}. Skim if it touches your build or market.",
            f"- **Links:** {md_link('Open', it['url'])}",
            f"- **Confidence:** Medium (feed digest)",
            "",
        ]

    lines += ["## Newsletters / Substack", ""]
    if newsletters:
        for it in newsletters:
            lines.append(f"- **{md_link(it['title'], it['url'])}** — {it['source']}")
    else:
        lines.append("_No newsletter items in this pull._")

    lines += ["", "## Labs & research blogs", ""]
    if labs:
        for it in labs:
            lines.append(f"- **{md_link(it['title'], it['url'])}** — {it['source']}")
    else:
        lines.append("_No lab items in this pull._")

    lines += ["", "## Watch / listen", ""]
    if videos:
        for it in videos:
            lines.append(f"- **{md_link(it['title'], it['url'])}** — {it['source']} · YouTube")
    else:
        lines.append("_No fresh videos in this pull._")

    lines += [
        "",
        "## Close",
        "",
        f"- **Read time:** ~{max(3, len(top))} min",
        f"- **One tap action:** {md_link(top[0]['title'], top[0]['url']) if top else 'n/a'}",
        "",
        "---",
        "",
        "_Manifest · generated by `scripts/generate_briefing.py` on GitHub Actions. "
        "Set repo secret `XAI_API_KEY` for LLM-polished briefs instead of raw digests._",
        "",
    ]
    return "\n".join(lines)


def _catalog(items: list[dict], limit: int = 28) -> list[dict]:
    out = []
    for it in items[:limit]:
        out.append(
            {
                "title": it["title"],
                "url": it["url"],
                "source": it["source"],
                "kind": it["kind"],
                "summary": (it.get("summary") or "")[:200],
            }
        )
    return out


def polish_prompt(items: list[dict], brief_type: str, when: datetime) -> tuple[str, str]:
    """Shared system + user prompts for any LLM (local or cloud)."""
    kind_label = "Sunday deep dive (weekly arcs)" if brief_type == "sunday" else "weekday mobile brief"
    system = (
        "You are Manifest, an AI intelligence officer for a hotshot trucker who reads on a phone "
        "and has ADHD. Eastern Time. Short. Punchy. No fluff. Real markdown links only using URLs "
        "provided — never invent URLs. Skeptical of hype. Drive-mode friendly."
    )
    user = f"""Write a {kind_label} for {when.strftime('%Y-%m-%d')} America/New_York.

Use ONLY these source items (skip weak ones). Every link MUST be a URL from this list:

{json.dumps(_catalog(items), indent=2)}

Format EXACTLY (include ## Speak for phone TTS — short, not the whole brief):

# AI Brief — {{weekday, Mon DD}} ET
(or Deep Dive title for Sunday)

## 60-second scan
- 5 bullets max. Each ends with **[Source](url)**

## Speak
4–8 short spoken lines. Numbered. Under 20 words each when possible.
End with: That's the load. Manifest out.

## Top stories (max 6)
### N. Short headline
- **Why it matters:** one concrete sentence (product, money, or power)
- **Links:** [Open](url)
- **Confidence:** High|Medium|Rumor

## For builders / practical
bullets with links — or skip

## Business & policy
bullets — or skip

## Watch / listen
YouTube only, with links — or skip

## Close
- **Read time:** ~X min
- **One tap action:** [label](url)

Priorities: industry/products, practical tools, business/markets.
"""
    return system, user


def polish_with_xai(items: list[dict], brief_type: str, when: datetime) -> str | None:
    api_key = os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY")
    if not api_key:
        return None

    system, user = polish_prompt(items, brief_type, when)
    body = {
        "model": os.environ.get("XAI_MODEL", "grok-4.3"),
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.3,
    }

    req = urllib.request.Request(
        "https://api.x.ai/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["choices"][0]["message"]["content"]
        footer = (
            "\n\n---\n\n_Manifest · polished via xAI API · "
            f"{when.strftime('%Y-%m-%d %H:%M %Z')}_\n"
        )
        return text.strip() + footer
    except Exception as e:
        print(f"xAI polish failed: {e}", file=sys.stderr)
        return None


def ollama_base() -> str:
    return (
        os.environ.get("OLLAMA_HOST")
        or os.environ.get("OLLAMA_BASE_URL")
        or "http://127.0.0.1:11434"
    ).rstrip("/")


def ollama_available(timeout: float = 1.5) -> bool:
    try:
        req = urllib.request.Request(
            f"{ollama_base()}/api/tags",
            headers={"User-Agent": USER_AGENT},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


def polish_with_ollama(items: list[dict], brief_type: str, when: datetime) -> str | None:
    """Local Ollama (same idea as Radar). Free. Requires Air on + ollama serve."""
    if not ollama_available():
        return None

    model = os.environ.get("OLLAMA_MODEL", "gemma2:9b")
    system, user = polish_prompt(items, brief_type, when)
    # Ollama chat: fold system into a single prompt for reliability on smaller models
    prompt = f"{system}\n\n{user}\n\nRespond with the markdown brief only."

    body = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.3,
            "num_predict": 2500,
        },
    }
    req = urllib.request.Request(
        f"{ollama_base()}/api/generate",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
        method="POST",
    )
    try:
        print(f"Ollama polish with {model} at {ollama_base()} …", file=sys.stderr)
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = (data.get("response") or "").strip()
        if not text:
            return None
        # Ensure Speak section exists for ADHD player even if model forgot
        if "## Speak" not in text and "## speak" not in text.lower():
            text += (
                "\n\n## Speak\n\n"
                f"Manifest. {when.strftime('%b %d')}. Here's the load.\n"
                "That's the load. Manifest out.\n"
            )
        footer = (
            f"\n\n---\n\n_Manifest · polished locally via Ollama `{model}` · "
            f"{when.strftime('%Y-%m-%d %H:%M %Z')} · $0 API · Air was on_\n"
        )
        return text + footer
    except Exception as e:
        print(f"Ollama polish failed: {e}", file=sys.stderr)
        return None


def polish(
    items: list[dict],
    brief_type: str,
    when: datetime,
    prefer: str = "auto",
) -> str | None:
    """
    prefer:
      auto  — local Ollama if up, else xAI if key, else None
      local — Ollama only
      xai   — xAI only
      none  — skip LLM
    """
    prefer = (prefer or "auto").lower()
    if prefer == "none":
        return None
    if prefer == "local":
        return polish_with_ollama(items, brief_type, when)
    if prefer == "xai":
        return polish_with_xai(items, brief_type, when)
    # auto: prefer free local when Air is on (Ollama up), then paid cloud
    if ollama_available():
        md = polish_with_ollama(items, brief_type, when)
        if md:
            return md
    return polish_with_xai(items, brief_type, when)


def load_index() -> dict:
    if INDEX_PATH.exists():
        return json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    return {"timezone": "America/New_York", "briefings": []}


def upsert_index(entry: dict) -> None:
    data = load_index()
    briefings = [b for b in data.get("briefings", []) if b.get("id") != entry["id"]]
    # Drop pure sample once real content exists
    if entry["id"] != "2026-08-10-sample":
        briefings = [b for b in briefings if b.get("id") != "2026-08-10-sample"]
    briefings.append(entry)
    briefings.sort(key=lambda b: b.get("date", ""), reverse=True)
    data["briefings"] = briefings
    data["timezone"] = "America/New_York"
    data["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    INDEX_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def first_paragraph_summary(md: str) -> str:
    """Prefer first non-empty bullet or prose line for the history card."""
    for line in md.splitlines():
        s = line.strip()
        if not s or s.startswith("#") or s.startswith("---"):
            continue
        if s.startswith("_") and s.endswith("_"):
            continue
        if s.startswith("- "):
            s = s[2:].strip()
            s = re.sub(r"\*\*([^*]+)\*\*", r"\1", s)
            s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)
            return s[:180]
        if not s.startswith("|") and not s.startswith("###"):
            s = re.sub(r"\*\*([^*]+)\*\*", r"\1", s)
            return s[:180]
    return "AI briefing"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate Manifest briefing (local Ollama and/or cloud)"
    )
    parser.add_argument("--type", choices=["weekday", "sunday", "auto"], default="auto")
    parser.add_argument("--date", help="Override date YYYY-MM-DD (ET calendar day)")
    parser.add_argument(
        "--polish",
        choices=["auto", "local", "xai", "none"],
        default=os.environ.get("MANIFEST_POLISH", "auto"),
        help="LLM polish: auto (Ollama if up, else xAI), local, xai, or none (RSS only)",
    )
    args = parser.parse_args()

    when = now_et()
    if args.date:
        when = datetime.strptime(args.date, "%Y-%m-%d").replace(tzinfo=ZONE_ET)

    brief_type = auto_type(when) if args.type == "auto" else args.type
    day = when.strftime("%Y-%m-%d")
    file_id = f"{day}-{brief_type}"
    rel_file = f"briefings/{file_id}.md"
    out_path = ROOT / rel_file

    print(f"Generating {file_id} (ET)… polish={args.polish}", file=sys.stderr)
    print("Collecting feeds…", file=sys.stderr)
    items = collect_items()
    print(f"Items: {len(items)}", file=sys.stderr)

    md = polish(items, brief_type, when, prefer=args.polish)
    if not md:
        print("No LLM polish — writing RSS digest", file=sys.stderr)
        md = build_markdown_feed_only(items, brief_type, when)

    BRIEFINGS.mkdir(parents=True, exist_ok=True)
    out_path.write_text(md, encoding="utf-8")

    # Title from first H1
    title = file_id
    for line in md.splitlines():
        if line.startswith("# "):
            title = line[2:].strip()
            break

    entry = {
        "id": file_id,
        "date": day,
        "type": brief_type,
        "title": title,
        "summary": first_paragraph_summary(md),
        "file": rel_file,
    }
    upsert_index(entry)
    print(f"Wrote {out_path}", file=sys.stderr)
    print(f"Updated {INDEX_PATH}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
