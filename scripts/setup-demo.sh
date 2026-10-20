#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo "Install and start Docker Desktop first."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Start Docker Desktop first."; exit 1; }
if [ ! -f .env ]; then
  umask 077
  cp .env.example .env
  # Generate independent local secrets. Existing configuration is never replaced.
  setup_session=$(openssl rand -hex 32)
  setup_job=$(openssl rand -hex 32)
  setup_password=$(openssl rand -hex 16)
  sed -i.bak \
    -e "s/SESSION_SECRET=replace-with-a-long-random-secret/SESSION_SECRET=$setup_session/" \
    -e "s/INTERNAL_JOB_SECRET=replace-with-a-long-random-job-secret/INTERNAL_JOB_SECRET=$setup_job/" \
    -e "s/DEMO_USER_PASSWORD=replace-with-a-local-demo-password/DEMO_USER_PASSWORD=$setup_password/" .env
  rm .env.bak
fi
docker compose up -d --build --wait --wait-timeout 240
docker compose exec -T api sh -c '
  export EVALUATOR_PASSWORD="$DEMO_USER_PASSWORD"
  export EVALUATOR_NOTIFICATION_EMAIL="$DEMO_NOTIFICATION_EMAIL"
  export EVALUATOR_PRIVATE_OUTPUT=/workspace/outputs/evaluator-accounts.json
  export EVALUATOR_SKIP_EXISTING=1
  pnpm --filter @mirai/api exec tsx prisma/seed-evaluator.ts
'
mkdir -p outputs
docker compose cp api:/workspace/outputs/evaluator-accounts.json outputs/evaluator-accounts.json 2>/dev/null || true
[ ! -f outputs/evaluator-accounts.json ] || chmod 600 outputs/evaluator-accounts.json
setup_web=$(docker compose port web 5173)
setup_mail=$(docker compose port mailpit 8025)
printf '%s\n' \
  "Demo ready: http://$setup_web" \
  'Login: evaluator.admin@mirai.local; password is DEMO_USER_PASSWORD in your local .env.' \
  "Read the six-digit verification code at http://$setup_mail." \
  'Three campuses and 15 demo subjects are available. Existing data is preserved.'
