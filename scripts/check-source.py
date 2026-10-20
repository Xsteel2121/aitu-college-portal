#!/usr/bin/env python3
"""Basic publication hygiene check; never prints matched secret values."""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
try:
    tracked = subprocess.check_output(
        ["git", "ls-files", "-z"], cwd=ROOT, stderr=subprocess.DEVNULL
    ).decode().split("\0")
    paths = [ROOT / name for name in tracked if name]
except (OSError, subprocess.CalledProcessError):
    skip = {"node_modules", ".next", ".git", ".vercel", ".wrangler", "dist"}
    paths = [p for p in ROOT.rglob("*") if p.is_file() and not skip.intersection(p.relative_to(ROOT).parts)]

patterns = {
    "GitHub token": rb"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b",
    "Telegram token": rb"\b[0-9]{8,12}:[A-Za-z0-9_-]{35}\b",
    "private PEM key": rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    "AWS access key": rb"\bAKIA[A-Z0-9]{16}\b",
}
findings = []
for p in paths:
    rel = p.relative_to(ROOT)
    if not p.is_file():
        continue
    if (p.name.startswith(".env") and p.name != ".env.example") or p.name.startswith(".dev.vars"):
        findings.append((rel, "local environment file"))
    if any(part in {"node_modules", ".next", ".vercel", ".wrangler"} for part in rel.parts):
        findings.append((rel, "runtime state"))
    if p.name in {"AGENTS.md", "CLAUDE.md"} or p.suffix in {".pem", ".key"}:
        findings.append((rel, "local tooling or private key file"))
    data = p.read_bytes()
    for label, pattern in patterns.items():
        if re.search(pattern, data):
            findings.append((rel, label))

for rel, reason in findings:
    print(f"FAIL: {rel}: {reason}")
if findings:
    sys.exit(1)
print(f"PASS: {len(paths)} files; no forbidden files or recognized token patterns. This is not a complete secret audit.")
