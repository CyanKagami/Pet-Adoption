// prisma/seed.js
const bcrypt = require('bcryptjs');
const { prisma, pool } = require('./client');

async function main() {
  console.log('🌱 Starting database seed...');

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 1. Create or upsert Demo Owner
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@pethome.com' },
    update: {},
    create: {
      email: 'demo@pethome.com',
      passwordHash,
      fullName: 'ศูนย์ช่วยเหลือสัตว์ PetHome',
      phoneNumber: '02-123-4567',
      isVerified: true,
      role: 'USER',
    },
  });

  console.log(`Created/Ensured User: ${demoUser.fullName} (${demoUser.email})`);

  // 2. Check existing pets
  const existingPetsCount = await prisma.pet.count();
  if (existingPetsCount === 0) {
    console.log('Seeding initial pets from wireframe...');

    const samplePets = [
      {
        name: 'ถั่วแดง',
        type: 'Dog',
        breed: 'บางแก้ว',
        gender: 'Male',
        ageMonths: 14,
        location: 'ศูนย์พักพิง A',
        status: 'AVAILABLE',
        adoptionConditions: 'มีพื้นที่วิ่งเล่นและรั้วรอบขอบชิด',
        images: ['https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600'],
      },
      {
        name: 'มะลิ',
        type: 'Cat',
        breed: 'วิเชียรมาศ',
        gender: 'Female',
        ageMonths: 8,
        location: 'บ้านพักชั่วคราว B',
        status: 'AVAILABLE',
        adoptionConditions: 'เลี้ยงระบบปิด มีการทำหมันและฉีดวัคซีนตามกำหนด',
        images: ['https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600'],
      },
      {
        name: 'โมจิ',
        type: 'Cat',
        breed: 'ไทย',
        gender: 'Female',
        ageMonths: 20,
        location: 'ศูนย์พักพิง A',
        status: 'AVAILABLE',
        adoptionConditions: 'ครอบครัวพร้อมดูแล ไม่ปล่อยออกนอกบ้าน',
        images: ['https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600'],
      },
    ];

    for (const p of samplePets) {
      const { images, ...petData } = p;
      await prisma.pet.create({
        data: {
          ...petData,
          ownerId: demoUser.id,
          images: {
            create: images.map((imageUrl, idx) => ({
              imageUrl,
              isPrimary: idx === 0,
            })),
          },
        },
      });
    }
    console.log(`Seeded ${samplePets.length} initial pets.`);
  } else {
    console.log(`Database already has ${existingPetsCount} pets, skipping initial pet seed.`);
  }

  console.log('✨ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
