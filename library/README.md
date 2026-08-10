# Library (Phase 2 — schema only)

**MVP does not render this section yet.**  
The phone app only shows **Pulse** history until Phase 1 habit is proven.

## Files

| Path | Role |
|------|------|
| `books.json` | Curated shelf (cap ~15 active). Source of truth. |
| `notes/` | Optional later: one markdown page per book |

## Rules

1. **Not thousands of books.** Soft max 15 active.
2. Every book needs `why`, `when`, `action` — or it doesn’t belong.
3. Prefer finishing over collecting.
4. Edit JSON when home (or PR); cloud Actions do not need to touch this for MVP.

## When Phase 2 ships

UI will read `books.json` and show lanes / status.  
Sunday deep dive may reference one `library_pick` id from the catalog.

See `docs/ROADMAP.md`.
