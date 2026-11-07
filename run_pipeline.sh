#!/bin/bash

set -e  # Exit on any error

PORT="${PORT:-3001}"

echo "🧠 What would you like to do?"
echo "1) Run full pipeline (scrape, serve)"
echo "2) Just view filtered listings (skip scraping)"
read -p "Enter 1 or 2: " choice

if [ "$choice" == "1" ]; then
  echo "🚀 Step 1: Activate virtual env"
  if [ -d ".venv" ]; then
    source .venv/bin/activate
  else
    echo "❌ .venv not found. Please create it first: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
  fi

  echo "🚀 Step 2: Running scrape.py"
  python3 scrape.py

elif [ "$choice" == "2" ]; then
  echo "📂 Skipping scraping..."
else
  echo "❌ Invalid option. Exiting."
  exit 1
fi

echo "🌐 Step 3: Starting Node server (http://localhost:${PORT})..."
if lsof -ti :"$PORT" >/dev/null 2>&1; then
  echo "⚠️ Freeing port ${PORT}..."
  kill -9 $(lsof -ti :"$PORT") 2>/dev/null || true
  sleep 1
fi
PORT=$PORT node server.js &
NODE_PID=$!

echo "🌍 Opening browser..."
sleep 1
open "http://localhost:${PORT}"

# --- Terminal remains open ---
echo ""
echo "🕓 Node server is running on http://localhost:${PORT} (PID: $NODE_PID)"
echo "❌ Type 'x' and press Enter to shut down the server and exit."
while true; do
  read -p "> " input
  if [[ "$input" == "x" ]]; then
    echo "🛑 Shutting down Node server..."
    kill "$NODE_PID" 2>/dev/null || true
    echo "👋 Exiting."
    break
  else
    echo "ℹ️ Type 'x' to stop the server and exit."
  fi
done
