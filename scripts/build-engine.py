"""Freeze the Python engine into a single executable for the installer.

    python scripts/build-engine.py

Produces `engine/dist/skaffo-engine[.exe]`, which electron-builder copies to
`resources/engine/` so the shipped app needs no Python on the user's machine.

Why PyInstaller rather than shipping embeddable CPython
-------------------------------------------------------
The embeddable distribution needs pip bootstrapped, a `._pth` edited, and the
site-packages tree copied in — three things that fail quietly and differently
per Windows build. A frozen exe is one file that either exists and runs, or
does not exist, which the launcher can check with `fs.existsSync`.

Hidden imports
--------------
Static analysis cannot see modules that are only reached through strings.
Ours are: uvicorn's protocol/lifespan implementations (selected by config
name), and SQLAlchemy's sqlite dialect (selected by URL scheme). Missing any
of these produces an exe that starts and then dies on the first request, so
they are listed explicitly and verified by actually running the binary below.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "engine"
DIST = ENGINE / "dist"
NAME = "skaffo-engine"

HIDDEN = [
    # uvicorn resolves these from strings in its config
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    # SQLAlchemy picks the dialect from the URL scheme
    "sqlalchemy.dialects.sqlite",
    "sqlalchemy.sql.default_comparator",
    # pydantic v2 internals
    "pydantic.deprecated.decorator",
]


def venv_python() -> Path:
    p = ENGINE / ".venv" / ("Scripts" if os.name == "nt" else "bin") / (
        "python.exe" if os.name == "nt" else "python")
    if not p.exists():
        sys.exit("engine/.venv not found — run setup-engine first")
    return p


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    print("  $", " ".join(str(c) for c in cmd))
    return subprocess.run(cmd, **kw)


def ensure_pyinstaller(py: Path) -> None:
    probe = run([str(py), "-c", "import PyInstaller"], capture_output=True)
    if probe.returncode == 0:
        return
    print("installing pyinstaller into the engine venv…")
    r = run([str(py), "-m", "pip", "install", "-q", "pyinstaller"])
    if r.returncode:
        sys.exit("could not install pyinstaller")


def freeze(py: Path) -> Path:
    shutil.rmtree(DIST, ignore_errors=True)
    shutil.rmtree(ENGINE / "build", ignore_errors=True)

    cmd = [
        str(py), "-m", "PyInstaller",
        "--onefile",
        "--name", NAME,
        "--distpath", str(DIST),
        "--workpath", str(ENGINE / "build"),
        "--specpath", str(ENGINE),
        "--paths", str(ENGINE),
        "--noconfirm",
        "--clean",
        # Templates are data, not code — PyInstaller will not find them.
        "--add-data", f"{ENGINE / 'app' / 'generator' / 'templates'}"
                      f"{os.pathsep}app/generator/templates",
        "--console",
    ]
    for h in HIDDEN:
        cmd += ["--hidden-import", h]
    # launch.py, not app/main.py: freezing the module directly strips its
    # package context and every relative import fails at startup.
    cmd.append(str(ENGINE / "launch.py"))

    r = run(cmd, cwd=ENGINE)
    if r.returncode:
        sys.exit("pyinstaller failed")

    exe = DIST / (f"{NAME}.exe" if os.name == "nt" else NAME)
    if not exe.exists():
        sys.exit(f"expected {exe}, but it was not produced")
    return exe


def smoke_test(exe: Path) -> None:
    """Start the frozen engine and exercise it. A binary that starts but
    cannot serve a request is the exact failure hidden imports cause."""
    import tempfile

    port = 8899
    data_dir = tempfile.mkdtemp(prefix="skaffo-freeze-")
    env = {**os.environ, "SKAFFO_DATA_DIR": data_dir, "SKAFFO_PORT": str(port)}

    print("\nsmoke test:")
    proc = subprocess.Popen([str(exe), "--port", str(port)], env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True)
    try:
        base = f"http://127.0.0.1:{port}"
        for _ in range(90):
            if proc.poll() is not None:
                print(proc.stdout.read()[-2000:])
                sys.exit("engine exited during startup")
            try:
                urllib.request.urlopen(base + "/health", timeout=1).read()
                break
            except (urllib.error.URLError, ConnectionError, OSError):
                time.sleep(0.4)
        else:
            sys.exit("engine never became reachable")
        print("  ✓ /health responds")

        # Creating a project exercises SQLAlchemy + the sqlite dialect.
        req = urllib.request.Request(
            base + "/api/projects",
            data=json.dumps({
                "name": "Freeze Check", "description": "",
                "stack": {"backend": "fastapi", "frontend": "react",
                          "database": "sqlite", "auth": "none",
                          "docker": False, "seedData": True, "seedRows": 3},
            }).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        pid = json.loads(urllib.request.urlopen(req, timeout=15).read())["id"]
        print("  ✓ project created (SQLAlchemy + sqlite dialect load)")

        # Rendering exercises Jinja and proves the templates were bundled.
        prev = json.loads(urllib.request.urlopen(
            f"{base}/api/projects/{pid}/generate/preview", timeout=30).read())
        if not prev.get("fileCount"):
            sys.exit("preview produced no files — templates missing from the bundle")
        print(f"  ✓ generator rendered {prev['fileCount']} files (templates bundled)")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(data_dir, ignore_errors=True)


def main() -> int:
    py = venv_python()
    ensure_pyinstaller(py)
    print(f"freezing engine with {py}")
    exe = freeze(py)
    size_mb = exe.stat().st_size / 1024 / 1024
    print(f"\nbuilt {exe}  ({size_mb:.1f} MB)")
    smoke_test(exe)
    print("\nengine is ready for packaging")
    return 0


if __name__ == "__main__":
    sys.exit(main())
