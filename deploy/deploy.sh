#!/usr/bin/env bash
#
# Deploys ADRAK to the server.
#
# Run from the repository root on the server itself:  ./deploy/deploy.sh
#
# The frontend is built HERE rather than uploaded. A dist directory is a few hundred kilobytes and
# the connection this is operated over drops constantly; `git pull` moves a diff, and a build that
# fails on the server fails loudly instead of arriving half-transferred.
#
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/adrak}"
PHP_FPM="${PHP_FPM:-php8.3-fpm}"

cd "$APP_DIR"

step() { printf '\n\033[1;36m▸ %s\033[0m\n' "$1"; }

# ---------------------------------------------------------------- maintenance
# Down first. A request served midway through a migration is a request served against a schema that
# exists in neither the old shape nor the new one.
step "Entering maintenance mode"
php api/artisan down --retry=15 --render="errors::503" || true

restore() {
  php api/artisan up || true
}
trap restore EXIT

# ---------------------------------------------------------------- code
step "Pulling"
git fetch --all --prune
git reset --hard origin/main

# ---------------------------------------------------------------- backend
step "Installing PHP dependencies"
composer install \
  --working-dir=api \
  --no-dev \
  --optimize-autoloader \
  --no-interaction \
  --prefer-dist

step "Migrating"
php api/artisan migrate --force

step "Loading content"
# Idempotent: the graph and question bank are updated in place, never duplicated.
php api/artisan adrak:seed-content

# ---------------------------------------------------------------- frontend
step "Building the PWA"
# `npm ci` and not `npm install`: the lockfile is the build, and a resolver that quietly picks a
# different minor on the server is how a bundle that passed its budget locally stops fitting.
npm --prefix web ci
npm --prefix web run build

step "Checking the performance budget"
# A build that exceeds it does not ship. This is the number that decides whether a student on 2G
# ever sees the app, so it is a gate and not a report.
node tools/check-bundle.mjs

# ---------------------------------------------------------------- caches
step "Warming caches"
php api/artisan config:cache
php api/artisan route:cache
php api/artisan event:cache
# View caching is deliberately skipped: this is an API with no Blade templates to compile.

step "Restarting PHP-FPM"
sudo systemctl reload "$PHP_FPM"

# ---------------------------------------------------------------- permissions
step "Fixing permissions"
sudo chown -R www-data:www-data api/storage api/bootstrap/cache
sudo chmod -R ug+rwX api/storage api/bootstrap/cache

step "Leaving maintenance mode"
php api/artisan up
trap - EXIT

step "Verifying"
curl -fsS -o /dev/null -w '  /up            → %{http_code}\n' https://adrak.apps.madafa.net/up
curl -fsS -o /dev/null -w '  /              → %{http_code}\n' https://adrak.apps.madafa.net/
curl -fsS -o /dev/null -w '  roster endpoint → %{http_code}\n' \
  https://adrak.apps.madafa.net/api/auth/classrooms/ADRAK26

printf '\n\033[1;32m✓ deployed\033[0m\n'
