#!/usr/bin/env bash
# Initialise the repo and push to GitHub.
# Run from D:\DICOM_VIEWER-main (Git Bash / WSL).
set -euo pipefail

REMOTE="https://github.com/Tarun-Meril/DICOM-WITH-LAB.git"

[ -f .gitignore ] || { echo "Run this from the project root."; exit 1; }

git init
git add .gitignore

# Stage everything else, then prove no patient data slipped through BEFORE
# the first commit — after a commit it is in history for good.
git add -A

echo
echo "=== Files that would be committed: ==="
git diff --cached --name-only | wc -l
echo
echo "=== Patient-data check ==="
if git diff --cached --name-only | grep -Ei '\.(dcm|dicom)$|backend/data/temp/'; then
  echo
  echo "ABORTING: DICOM data is staged. Fix .gitignore, then run: git rm -r --cached ."
  exit 1
fi
echo "Clean — no DICOM instances staged."
echo
echo "=== Largest staged files ==="
git diff --cached --name-only -z | xargs -0 du -h 2>/dev/null | sort -rh | head -10

echo
read -r -p "Proceed with commit and push? [y/N] " reply
[[ "$reply" == "y" || "$reply" == "Y" ]] || { echo "Stopped. Nothing committed."; exit 0; }

git commit -m "Integrate MPR workstation directly into the main viewer

Clicking MPR in the 2D viewer now renders the full multiplanar
workstation in place, instead of an empty panel behind an
\"Open Standalone MPR\" button.

- Add MPRViewerCore, a route-agnostic shared workstation body
- Add /mpr standalone route that mounts the same component
- Pass the selected series through MPRController and StudyManager
  so the reformat matches what is open in 2D
- Add VOI and zoom/pan sync toggles behind Sync W/L and Link Views"

git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"
git push -u origin main
