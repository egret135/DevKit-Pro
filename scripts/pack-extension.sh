#!/usr/bin/env bash
# Package DevKit Pro for Chrome Web Store upload.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")"
OUT_DIR="${ROOT}/dist"
ZIP_NAME="DevKit-Pro-${VERSION}.zip"
ZIP_PATH="${OUT_DIR}/${ZIP_NAME}"

mkdir -p "$OUT_DIR"
rm -f "$ZIP_PATH"

# Zip contents of the extension root (manifest.json at archive root).
# Exclude VCS, IDE, docs, tests, dist, and OS junk.
zip -r "$ZIP_PATH" . \
  -x ".git/*" \
  -x ".gitignore" \
  -x "*node_modules*" \
  -x "*.DS_Store" \
  -x "*__MACOSX*" \
  -x ".cursor/*" \
  -x "dist/*" \
  -x "store/*" \
  -x "docs/*" \
  -x "scripts/*" \
  -x "*.md" \
  -x "LICENSE" \
  -x ".idea/*" \
  -x ".vscode/*" \
  -x "test.html" \
  -x "test-protobuf.html" \
  -x "test/*" \
  -x "tests/*"

echo "Created: ${ZIP_PATH}"
python3 - <<PY
import json, sys, zipfile
ver = json.load(open("manifest.json"))["version"]
zp = f"dist/DevKit-Pro-{ver}.zip"
with zipfile.ZipFile(zp) as z:
    names = z.namelist()
assert "manifest.json" in names, "manifest.json must be at zip root"
bad = [n for n in names if n.startswith(("store/", "docs/", ".git/", "scripts/")) or n in ("test.html", "test-protobuf.html")]
if bad:
    print("Unexpected entries:", bad)
    sys.exit(1)
print(f"Verified: {len(names)} files, manifest at root")
PY
SIZE="$(du -h "$ZIP_PATH" | cut -f1)"
echo "Size: ${SIZE}"
echo "Upload this file in Chrome Web Store Developer Dashboard."
