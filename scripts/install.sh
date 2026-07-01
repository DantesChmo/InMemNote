#!/usr/bin/env bash
#
# One-shot installer for Inmemnote on macOS.
#
# Downloads the latest release DMG from GitHub, copies the app into
# /Applications and launches it. Because curl (unlike a browser) does NOT
# stamp the download with `com.apple.quarantine`, the app opens on a plain
# double-click afterwards — no Gatekeeper "unidentified developer" prompt,
# no trip to System Settings. We still strip the quarantine flag defensively
# so the script behaves the same if it's ever re-run against a browser-
# downloaded copy.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/DantesChmo/InMemNote/main/scripts/install.sh | bash
#
set -euo pipefail

REPO="DantesChmo/InMemNote"
ASSET="Inmemnote-macos-arm64.dmg"
URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
APP="Inmemnote.app"
DEST="/Applications"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Inmemnote is macOS-only (this is $(uname -s))." >&2
  exit 1
fi
if [[ "$(uname -m)" != "arm64" ]]; then
  echo "Warning: releases are built for Apple Silicon (arm64); this Mac reports $(uname -m)." >&2
  echo "The app may not launch. Continuing anyway…" >&2
fi

tmp="$(mktemp -d)"
dmg="${tmp}/${ASSET}"
mount="${tmp}/mnt"

# Always detach the image and clean up the temp dir, even on error.
cleanup() {
  if [[ -d "${mount}" ]]; then
    hdiutil detach "${mount}" -quiet -force >/dev/null 2>&1 || true
  fi
  rm -rf "${tmp}"
}
trap cleanup EXIT

echo "Downloading ${ASSET}…"
# -f fails on 404 (e.g. no release yet) instead of saving an HTML error page.
curl -fL --progress-bar -o "${dmg}" "${URL}"

echo "Mounting…"
# Force an explicit, private mount point so we never collide with a stray
# "/Volumes/Inmemnote 1" left over from a manual open, and so cleanup is exact.
mkdir -p "${mount}"
hdiutil attach "${dmg}" -nobrowse -noautoopen -noverify -mountpoint "${mount}" >/dev/null

echo "Installing to ${DEST}/${APP}…"
# Replace any previous copy so we don't merge an old and new bundle.
rm -rf "${DEST:?}/${APP}"
cp -R "${mount}/${APP}" "${DEST}/"

hdiutil detach "${mount}" -quiet
rmdir "${mount}" 2>/dev/null || true

# Defensive: curl-downloaded files aren't quarantined, but strip the flag
# anyway so a re-run against a browser download still yields a clean launch.
xattr -dr com.apple.quarantine "${DEST}/${APP}" 2>/dev/null || true

echo "Done. Launching Inmemnote…"
open "${DEST}/${APP}"
