#!/bin/sh
set -eu

demo_password=${DEMO_USER_PASSWORD:-}
demo_notification_email=${DEMO_NOTIFICATION_EMAIL:-}
if [ "${#demo_password}" -lt 12 ]; then
  echo "DEMO_USER_PASSWORD must contain at least 12 characters." >&2
  exit 2
fi

docker compose --env-file .env.production -f docker-compose.production.yml \
  exec -e DEMO_USER_PASSWORD="$demo_password" \
  -e DEMO_NOTIFICATION_EMAIL="$demo_notification_email" api \
  pnpm --filter @mirai/api prisma:seed
