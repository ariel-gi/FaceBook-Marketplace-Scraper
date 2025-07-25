#!/bin/bash

set -e  # Exit on any error

echo "🧠 What would you like to do?"
echo "1) Run full pipeline (scrape, serve)"
echo "2) Just view filtered listings (skip scraping)"
read -p "Enter 1 or 2: " choice

if [ "$choice" == "1" ]; then
  echo "🚀 Step 1: Activate virtual env"
  source .venv/bin/activate

  echo "🚀 Step 2: Running scrape.py"
  python3 scrape.py

  echo "⏸️ Waiting for Facebook login and scrolling..."

elif [ "$choice" == "2" ]; then
  echo "📂 Skipping scraping..."
else
  echo "❌ Invalid option. Exiting."
  exit 1
fi

echo "🌐 Step 4: Killing any previous Node servers on port 3000..."
killall node 2>/dev/null || echo "No existing Node processes to kill."

echo "🌐 Starting Node server (http://localhost:3000)..."
node server.js &

echo "🌍 Opening browser..."
sleep 1
open http://localhost:3000

# --- Terminal remains open ---
echo ""
echo "🕓 Node server is running on http://localhost:3000"
echo "❌ Type 'x' and press Enter to shut down the server and exit."
while true; do
  read -p "> " input
  if [[ "$input" == "x" ]]; then
    echo "🛑 Shutting down Node server on port 3000..."
    killall node 2>/dev/null || echo "No existing Node processes to kill."
    echo "👋 Exiting."
    break
  else
    echo "ℹ️ Type 'x' to stop the server and exit."
  fi
done
