@echo off
REM ── Skaffo Engine setup (run once) ─────────────────
cd /d "%~dp0engine"

echo Creating virtualenv...
python -m venv .venv
if errorlevel 1 (
  echo.
  echo ERROR: python not found. Install Python 3.10+ from python.org
  echo and make sure "Add Python to PATH" is checked.
  pause
  exit /b 1
)

echo Installing dependencies...
.venv\Scripts\python -m pip install --upgrade pip -q
.venv\Scripts\pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo ERROR: pip install failed. Check your internet connection.
  pause
  exit /b 1
)

echo.
echo ============================================
echo  Engine ready. Now run:  npm run dev
echo ============================================
echo.
echo  To run the test suite as well:
echo    cd engine
echo    .venv\Scripts\pip install -r requirements-dev.txt
echo    .venv\Scripts\python -m pytest tests\ -q
echo.
pause
