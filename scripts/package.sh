#!/usr/bin/env bash
# 打一个可以直接上传到 Chrome 商店（或拖进 chrome://extensions）的 zip。
# 用法：bash scripts/package.sh
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -e "process.stdout.write(require('./manifest.json').version)" 2>/dev/null \
  || sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json)
OUT="dist/gemini-lite-${VERSION}.zip"

# 只放运行时需要的文件。icon1024.png 是给商店/预览用的，不进包。
FILES=(
  manifest.json
  export.js
  lite.js
  bridge.js
  popup.html
  popup.js
  icons/icon16.png
  icons/icon32.png
  icons/icon48.png
  icons/icon128.png
)

rm -rf dist
mkdir -p dist
zip -q -X "${OUT}" "${FILES[@]}"

echo "built ${OUT}"
unzip -l "${OUT}"
