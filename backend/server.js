require('dotenv/config');

const express = require('express');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const { createPetsRouter } = require('./src/routes/pets.routes');

const app = express();
const port = Number(process.env.PORT || 5000);
const api = '/api/v1';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(`${api}/pets`, createPetsRouter(prisma));

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    return response.status(400).json({
      success: false,
      error: { code: error.code === 'LIMIT_UNEXPECTED_FILE' ? 'INVALID_IMAGES' : error.code, message: error.message },
    });
  }

  const status = error.status || 500;
  response.status(status).json({
    success: false,
    error: {
      code: error.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST'),
      message: status === 500 ? 'Internal server error' : error.message,
      ...(error.details && { details: error.details }),
    },
  });
});

async function start() {
  await prisma.$connect();
  app.listen(port, () => console.log(`Backend listening on port ${port}`));
}

start().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
