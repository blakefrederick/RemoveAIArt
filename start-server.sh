#!/bin/bash

# RemoveAIArt Test Server Launcher
echo "🎨 Starting RemoveAIArt Test Server..."

# Check if Python 3 is available
if command -v python3 &> /dev/null; then
    python3 server.py
elif command -v python &> /dev/null; then
    python server.py
else
    echo "❌ Error: Python not found!"
    echo "Please install Python 3 to run the test server."
    exit 1
fi
