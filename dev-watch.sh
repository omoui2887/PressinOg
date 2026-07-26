#!/bin/bash
# Dev server watcher — redémarre le serveur quand il meurt
# Complètement détaché via setsid
cd /home/z/my-project

while true; do
  echo "[$(date '+%H:%M:%S')] Starting dev server..."
  node node_modules/.bin/next dev -p 3000
  EXIT_CODE=$?
  echo "[$(date '+%H:%M:%S')] Dev server exited with code $EXIT_CODE"
  sleep 2
done
