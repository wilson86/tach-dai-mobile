#!/usr/bin/env python3
"""WILSON86 KTS Issue #18: source-pinned, C:-only, review-only local r24d preview.
No production deployment, CI, money transfer, Telegram, E:/F: access, or source edits.
Run via: python issue18-r24e-preview.py
"""
from __future__ import annotations

import functools
import hashlib
import http.server
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile

ROOT = Path(r"C:\KTS-QA")
STAGE = ROOT / "issue18-quyt-review-r24e-20261104"
PORT = 8777
SOURCES = {
    "Mobile": ("tach-dai-mobile", "cc3cd4ab6512f73e082ab23e1d804c9c189bb3ae",
               "6a7278b1175b0baaacd3fb38dd4a5d8e43aca133"),
    "Ngang": ("tach-dai-ngang", "5c6d0461e2356461d6056a4ec97485ce912002c4",
              "4c3a81d35b479e13137a4c679fcb29560e137899"),
}
UI_BLOB = "95af11ca257970af4ba291bed2ab70fa29d5cd8a"
ENGINE_BLOB = "9b429b9477798861e42cfbcec99b6d0e9b041050"

def git_blob(path: Path) -> str:
    data = path.read_bytes()
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\x00" + data).hexdigest()

def check_source(root: Path, sw_blob: str) -> None:
    for rel, expected in [
        ("index.html", None),
        ("quyt-bao-review-ui.js", UI_BLOB),
        ("business_engine.generated.js", ENGINE_BLOB),
        ("sw.js", sw_blob),
    ]:
        p = root / rel
        if not p.is_file():
            raise RuntimeError(f"Missing required file: {p}")
        if expected is not None and git_blob(p) != expected:
            raise RuntimeError(f"Source SHA mismatch: {p}")
    if b"r24e-customer-paste-name" not in (root / "sw.js").read_bytes():
        raise RuntimeError("Stale service-worker cache")

def unzip_pinned(repo: str, sha: str, target: Path, tmp: Path) -> Path:
    url = f"https://github.com/wilson86/{repo}/archive/{sha}.zip"
    zippath = tmp / f"{repo}.zip"
    request = urllib.request.Request(url, headers={"User-Agent": "WILSON86-KTS-local-review"})
    with urllib.request.urlopen(request, timeout=45) as response, zippath.open("wb") as out:
        shutil.copyfileobj(response, out)
    with zipfile.ZipFile(zippath) as archive:
        for entry in archive.infolist():
            parts = PurePosixPath(entry.filename).parts
            if not parts or ".." in parts or entry.filename.startswith(("/", "\\")):
                raise RuntimeError("Unsafe archive path")
        archive.extractall(target)
    folders = [p for p in target.iterdir() if p.is_dir()]
    if len(folders) != 1:
        raise RuntimeError(f"Expected one extracted folder in {target}")
    return folders[0]

def native_tests(source: Path, label: str, qa: Path) -> None:
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Native Node not found; keeping staging blocked")
    qa.mkdir(parents=True, exist_ok=True)
    jobs = [
        [node, "--test", "tests/quyt-bao-ui-contract.test.js",
         "tests/quyt-customer-profiles.test.js",
         "tests/customer-message-review.test.js",
         "tests/clean-aggregate-review.test.js",
         "tests/issue18-r24-dui-diagnostics.test.js"],
        [node, "tests/release-review-asset-consistency.js"],
    ]
    for index, command in enumerate(jobs, 1):
        result = subprocess.run(command, cwd=source, capture_output=True,
                                text=True, errors="replace", timeout=120)
        log = qa / f"{label}-native-{index}.txt"
        log.write_text(result.stdout + "\n--- STDERR ---\n" + result.stderr, encoding="utf-8")
        print(f"{label} native test {index}: exit {result.returncode}; evidence {log}")
        if result.returncode != 0:
            raise RuntimeError(f"{label} native QA FAILED; no preview admission")

def prepare() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    receipt = STAGE / "KTS_R24E_SOURCE_RECEIPT.json"
    if STAGE.exists():
        if not receipt.is_file():
            raise RuntimeError(f"Unknown existing stage, KEEP untouched: {STAGE}")
        manifest = json.loads(receipt.read_text(encoding="utf-8"))
        if manifest.get("sources") != {k: v[1] for k, v in SOURCES.items()}:
            raise RuntimeError("Existing stage has a different source; KEEP untouched")
        check_source(STAGE, SOURCES["Mobile"][2])
        check_source(STAGE / "Ngang", SOURCES["Ngang"][2])
        print("Existing qualified stage reused without overwriting it.")
        return
    temp = Path(tempfile.mkdtemp(prefix="_issue18-r24e-", dir=ROOT))
    try:
        source_roots = {}
        for name, (repo, sha, sw_hash) in SOURCES.items():
            src = unzip_pinned(repo, sha, temp / name, temp)
            check_source(src, sw_hash)
            source_roots[name] = src
        qa = temp / "qa"
        for name, src in source_roots.items():
            native_tests(src, name, qa)
        build = temp / "prepared"
        shutil.copytree(source_roots["Mobile"], build)
        if (build / "Ngang").exists():
            raise RuntimeError("Unexpected Ngang directory in Mobile root")
        shutil.copytree(source_roots["Ngang"], build / "Ngang")
        unified = build / "app" / "index.html"
        html = unified.read_text(encoding="utf-8")
        remote = 'src="https://wilson86.github.io/tach-dai-ngang/"'
        if html.count(remote) != 1:
            raise RuntimeError("Unified iframe source changed; cannot safely patch stage")
        unified.write_text(html.replace(remote, 'src="../Ngang/"'),
                           encoding="utf-8")
        shutil.copytree(qa, build / "KTS_R24E_QA")
        data = {
            "scope": "LOCAL_REVIEW_ONLY",
            "sources": {k: v[1] for k, v in SOURCES.items()},
            "ui_git_blob": UI_BLOB,
            "source_engine_git_blob": ENGINE_BLOB,
            "native_focused_qa": "PASS",
            "chrome_qa": "NOT_RUN",
            "release": "NO_GO",
            "cost_usd": 0,
        }
        (build / "KTS_R24E_SOURCE_RECEIPT.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        check_source(build, SOURCES["Mobile"][2])
        check_source(build / "Ngang", SOURCES["Ngang"][2])
        if STAGE.exists():
            raise RuntimeError(f"Race: stage already exists; KEEP {STAGE}")
        build.rename(STAGE)
        print("STAGED:", STAGE)
        print("SOURCE AND NATIVE QA: PASS; Chrome acceptance NOT_RUN")
    except Exception as exc:
        print("BLOCKED; original r23/r24/r24b preserved.")
        print("Failure evidence KEEP:", temp)
        raise
    else:
        shutil.rmtree(temp)
        print("CLEANUP_STATUS=VERIFIED_TEMP_REMOVED")
        print("FILES_PRESERVED=source, rollback, native QA logs, receipt")
        print("COST_USD=0")

if __name__ == "__main__":
    prepare()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler,
                                directory=str(STAGE))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as server:
        print(f"Open http://127.0.0.1:{PORT}/ for Mobile")
        print(f"Open http://127.0.0.1:{PORT}/app/ for Unified")
        print(f"Open http://127.0.0.1:{PORT}/Ngang/ for Ngang")
        print("Leave this window open; Ctrl+C stops LOCAL preview.")
        server.serve_forever()
