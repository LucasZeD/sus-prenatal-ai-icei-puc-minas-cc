#!/bin/sh
set -e

i=0
until npx prisma migrate deploy; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "prisma_migrate_failed attempts=$i"
    exit 1
  fi
  sleep 2
done

exec node dist/index.js
