#!/bin/bash
# Script de démarrage du dev server avec restart auto
while true; do
  node /home/z/my-project/node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "[start-dev.sh] Next crashed at $(date), restarting in 2s..." >> /home/z/my-project/dev.log
  sleep 2
done
