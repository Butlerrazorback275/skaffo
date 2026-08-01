#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/engine"
echo "Creating virtualenv..."
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip -q
.venv/bin/pip install -r requirements.txt
echo
echo "Engine ready. Now run: npm run dev"
echo
echo "To run the test suite as well:"
echo "  cd engine"
echo "  .venv/bin/pip install -r requirements-dev.txt"
echo "  .venv/bin/python -m pytest tests/ -q"
