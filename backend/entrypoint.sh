#!/bin/sh

echo "⏳ Waiting for PostgreSQL to start..."
until nc -z -v -w30 postgres 5432; do
  echo "Waiting for database connection..."
  sleep 1
done
echo "✅ PostgreSQL is up and running!"

echo "📦 Checking backend dependencies..."
lock_hash=$(sha256sum package-lock.json | cut -d ' ' -f 1)
if [ ! -f node_modules/.package-lock.sha256 ] || [ "$(cat node_modules/.package-lock.sha256)" != "$lock_hash" ]; then
  npm ci || exit 1
  printf '%s\n' "$lock_hash" > node_modules/.package-lock.sha256
fi

echo "🔄 Running Prisma migrations..."
npx prisma@7 migrate dev --name init || npx prisma@7 db push

echo "🔧 Generating Prisma Client..."
npm run prisma:generate || exit 1

echo "🚀 Starting Backend Application..."
exec npm run dev