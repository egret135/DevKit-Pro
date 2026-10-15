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
  -x "tests/*" \
  -x "popup.html" \
  -x "popup.js" \
  -x "popup.css" \
  -x "go/*" \
  -x "go" \
  -x "main.go"

echo "Created: ${ZIP_PATH}"
python3 - <<PY
import json, sys, zipfile
ver = json.load(open("manifest.json"))["version"]
zp = f"dist/DevKit-Pro-{ver}.zip"
import re
remote = re.compile(
    r"https?://(?:cdnjs\.cloudflare\.com|unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\S{0,200}?\.(?:js|mjs|css|wasm)",
    re.I,
)
script_src = re.compile(r"""<script[^>]+src=["']https?://""", re.I)
with zipfile.ZipFile(zp) as z:
    names = z.namelist()
    assert "manifest.json" in names, "manifest.json must be at zip root"
    banned_prefixes = ("store/", "docs/", ".git/", "scripts/", "go/")
    banned_exact = {
        "test.html",
        "test-protobuf.html",
        "popup.html",
        "popup.js",
        "popup.css",
        "main.go",
        "LICENSE",
    }
    bad = [
        n for n in names
        if n.startswith(banned_prefixes) or n in banned_exact or n.endswith(".md")
    ]
    if bad:
        print("Unexpected entries:", bad)
        sys.exit(1)
    print(f"Verified: {len(names)} files, manifest at root")
    hits = []
    for name in names:
        if name.endswith("/"):
            continue
        text = z.read(name).decode("utf-8", errors="ignore")
        for m in remote.findall(text):
            hits.append(f"{name}: {m[:180]}")
        if script_src.search(text):
            hits.append(name + ': remote script src')
    if hits:
        print("Remotely hosted code detected:")
        for h in hits[:30]:
            print(" ", h)
        sys.exit(1)
    print("Remote executable URL scan: clean")
PY
SIZE="$(du -h "$ZIP_PATH" | cut -f1)"
echo "Size: ${SIZE}"
echo "Upload this file in Chrome Web Store Developer Dashboard."
