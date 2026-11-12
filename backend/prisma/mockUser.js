// prisma/mockUser.js
const bcrypt = require('bcryptjs');
const { prisma, pool } = require('./client');

async function mockUser() {
  console.log('👤 Starting mock users creation...\n');

  try {
    const password = 'Password123!';
    const passwordHash = await bcrypt.hash(password, 10);

    const usersData = [
      {
        email: 'demo@pethome.com',
        fullName: 'ศูนย์ช่วยเหลือสัตว์ PetHome',
        phoneNumber: '02-123-4567',
        isVerified: true,
        displayRole: 'เจ้าของสัตว์เลี้ยง / ศูนย์พักพิง (Shelter Owner)',
      },
      {
        email: 'somchai@example.com',
        fullName: 'คุณสมชาย ใจมั่นคง',
        phoneNumber: '081-234-5678',
        isVerified: true,
        displayRole: 'ผู้ขอรับเลี้ยง (Adopter - สนใจน้องถั่วแดง)',
      },
      {
        email: 'jaidee@example.com',
        fullName: 'คุณใจดี รักสัตว์',
        phoneNumber: '089-876-5432',
        isVerified: true,
        displayRole: 'ผู้ขอรับเลี้ยง (Adopter - สนใจน้องมะลิ)',
      },
    ];

    const createdUsers = [];

    for (const u of usersData) {
      const user = await prisma.user.upsert({
        where: { email: u.email },
        update: {
          fullName: u.fullName,
          passwordHash,
          phoneNumber: u.phoneNumber,
          isVerified: u.isVerified,
        },
        create: {
          email: u.email,
          fullName: u.fullName,
          passwordHash,
          phoneNumber: u.phoneNumber,
          isVerified: u.isVerified,
          role: 'USER',
        },
      });

      createdUsers.push({
        id: user.id,
        name: user.fullName,
        email: user.email,
        password: password,
        role: u.displayRole,
        verified: user.isVerified ? '✓ ยืนยันแล้ว' : 'ยังไม่ยืนยัน',
      });
    }

    console.log('========================================================================================');
    console.log('🎉 Mock Users Created Successfully! (3 Accounts)');
    console.log('========================================================================================');
    console.table(
      createdUsers.map((u, idx) => ({
        'No.': idx + 1,
        'Name': u.name,
        'Email': u.email,
        'Password': u.password,
        'Role': u.role,
        'Verified': u.verified,
      }))
    );
    console.log('========================================================================================\n');
    console.log('🔑 Login URL: http://localhost:3000/login\n');
  } catch (error) {
    console.error('❌ Error creating mock users:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

mockUser();
