#!/bin/bash

# Refresh Metro Server - kill existing and start fresh

# Kill any existing Metro/Expo processes
pkill -f "expo start" 2>/dev/null || true
pkill -f "metro" 2>/dev/null || true
lsof -ti:8081 | xargs kill -9 2>/dev/null || true

# Start fresh Metro server in background
nohup npx expo start --clear > metro.log 2>&1 &

echo "Metro server refreshed - check metro.log for output" 