#!/bin/bash
# Publish changes to the live site.
# Usage: ./publish.sh
# Run this from inside the haute-attire-v3 folder any time you've
# received updated files from Claude and want them live on Render.

set -e
cd "$(dirname "$0")"

echo "Checking for changes..."
if git diff --quiet && git diff --cached --quiet; then
  echo "Nothing has changed since the last publish."
  exit 0
fi

git add .
git commit -m "Site update $(date '+%Y-%m-%d %H:%M')"
git push

echo ""
echo "Done. Render is rebuilding your site now — it takes about 2 minutes."
echo "Check progress at: https://dashboard.render.com"
