#!/bin/sh

echo "⏳ Waiting for PostgreSQL to start..."
until nc -z -v -w30 postgres 5432; do
  echo "Waiting for database connection..."
  sleep 1
done
echo "✅ PostgreSQL is up and running!"

echo "🔄 Running Prisma migrations..."
npx prisma migrate dev --name init || npx prisma db push

echo "🚀 Starting Backend Application..."
exec npm run dev