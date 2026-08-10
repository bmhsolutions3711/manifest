#!/usr/bin/env bash
# Generate a Manifest brief on THIS machine (Ollama), then optional git push.
# Use when the Air is on at home — not for road automation.
set -euo pipefail
cd "$(dirname "$0")/.."

export MANIFEST_POLISH="${MANIFEST_POLISH:-local}"
export OLLAMA_MODEL="${OLLAMA_MODEL:-gemma2:9b}"
export OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"

TYPE="${1:-auto}"

if ! curl -sf "${OLLAMA_HOST}/api/tags" >/dev/null; then
  echo "Ollama not reachable at ${OLLAMA_HOST}"
  echo "Start it: open the Ollama app, or: ollama serve"
  exit 1
fi

echo "→ Generating with local ${OLLAMA_MODEL} (type=${TYPE})"
python3 scripts/generate_briefing.py --type "$TYPE" --polish local

if [[ "${PUSH:-}" == "1" ]]; then
  git add briefings/
  if git diff --staged --quiet; then
    echo "No briefing changes to commit"
  else
    git commit -m "chore(manifest): local Ollama brief $(date -u +%Y-%m-%d)"
    git push origin main
    echo "→ Pushed — site will update on GitHub Pages"
  fi
else
  echo ""
  echo "Brief written under briefings/."
  echo "Preview:  python3 -m http.server 8765"
  echo "Publish:  PUSH=1 ./scripts/run-local.sh"
fi
