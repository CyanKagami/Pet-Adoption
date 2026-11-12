// prisma/mockData.js
const bcrypt = require('bcryptjs');
const { prisma, pool } = require('./client');

async function mockData() {
  console.log('🌱 Starting database mock data seeding...');

  try {
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // 1. Create or ensure Users
    console.log('1. Creating Users...');
    const demoOwner = await prisma.user.upsert({
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

    const somchai = await prisma.user.upsert({
      where: { email: 'somchai@example.com' },
      update: {},
      create: {
        email: 'somchai@example.com',
        passwordHash,
        fullName: 'คุณสมชาย',
        phoneNumber: '081-234-5678',
        isVerified: true,
        role: 'USER',
      },
    });

    const jaidee = await prisma.user.upsert({
      where: { email: 'jaidee@example.com' },
      update: {},
      create: {
        email: 'jaidee@example.com',
        passwordHash,
        fullName: 'คุณใจดี',
        phoneNumber: '089-876-5432',
        isVerified: true,
        role: 'USER',
      },
    });

    const nid = await prisma.user.upsert({
      where: { email: 'nid@example.com' },
      update: {},
      create: {
        email: 'nid@example.com',
        passwordHash,
        fullName: 'คุณนิด',
        phoneNumber: '086-555-4321',
        isVerified: false,
        role: 'USER',
      },
    });

    const manee = await prisma.user.upsert({
      where: { email: 'manee@example.com' },
      update: {},
      create: {
        email: 'manee@example.com',
        passwordHash,
        fullName: 'คุณมานี',
        phoneNumber: '084-111-2233',
        isVerified: true,
        role: 'USER',
      },
    });

    console.log('✅ Users created: PetHome, คุณสมชาย, คุณใจดี, คุณนิด, คุณมานี');

    // 2. Create Pets
    console.log('2. Creating Pets...');
    const petsData = [
      {
        name: 'ถั่วแดง',
        type: 'Dog',
        breed: 'บางแก้ว',
        gender: 'Male',
        ageMonths: 14,
        location: 'ศูนย์พักพิง A',
        status: 'AVAILABLE',
        adoptionConditions: 'มีพื้นที่วิ่งเล่นและรั้วรอบขอบชิด',
        healthInfo: {
          disease: 'ไม่มี',
          vaccinated: '2026-08-10',
          neutered: true,
          healthDocs: [],
        },
        imageUrl: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600',
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
        healthInfo: {
          disease: 'ไม่มี',
          vaccinated: '2026-09-15',
          neutered: true,
          healthDocs: [],
        },
        imageUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600',
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
        healthInfo: {
          disease: 'ไม่มี',
          vaccinated: '2026-05-20',
          neutered: true,
          healthDocs: [],
        },
        imageUrl: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600',
      },
      {
        name: 'บ๊อบบี้',
        type: 'Dog',
        breed: 'โกลเด้นผสม',
        gender: 'Male',
        ageMonths: 24,
        location: 'กรุงเทพฯ (บางนา)',
        status: 'AVAILABLE',
        adoptionConditions: 'ผู้เลี้ยงมีความพร้อมและมีเวลาพาวิ่งเล่น',
        healthInfo: {
          disease: 'ไม่มี',
          vaccinated: '2026-07-01',
          neutered: false,
          healthDocs: [],
        },
        imageUrl: 'https://images.unsplash.com/photo-1552053831-71594a27632d?w=600',
      },
      {
        name: 'ส้มจี๊ด',
        type: 'Cat',
        breed: 'ไทยส้ม',
        gender: 'Male',
        ageMonths: 6,
        location: 'นนทบุรี',
        status: 'AVAILABLE',
        adoptionConditions: 'รักแมว เลี้ยงระบบปิด',
        healthInfo: {
          disease: 'ไม่มี',
          vaccinated: '2026-10-01',
          neutered: true,
          healthDocs: [],
        },
        imageUrl: 'https://images.unsplash.com/photo-1548802673-380ab8ebc7b7?w=600',
      },
      {
        name: 'เฉาก๊วย',
        type: 'Dog',
        breed: 'ไซบีเรียน ฮัสกี้',
        gender: 'Male',
        ageMonths: 18,
        location: 'ศูนย์พักพิง A',
        status: 'ADOPTED',
        adoptionConditions: 'มีห้องแอร์หรือสถานที่อากาศถ่ายเท',
        healthInfo: {
          disease: 'ไม่มี',
          vaccinated: '2026-06-15',
          neutered: true,
          healthDocs: [],
        },
        imageUrl: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=600',
      },
    ];

    const createdPets = {};

    for (const petItem of petsData) {
      const { imageUrl, ...petDetails } = petItem;
      let pet = await prisma.pet.findFirst({
        where: { name: petDetails.name, ownerId: demoOwner.id },
      });

      if (!pet) {
        pet = await prisma.pet.create({
          data: {
            ...petDetails,
            ownerId: demoOwner.id,
            images: {
              create: [
                {
                  imageUrl,
                  isPrimary: true,
                },
              ],
            },
          },
        });
      }

      createdPets[pet.name] = pet;
    }

    console.log(`✅ Pets created: ${Object.keys(createdPets).join(', ')}`);

    // 3. Create Applications (FR-02, FR-08)
    console.log('3. Creating Applications...');
    const thuadangPet = createdPets['ถั่วแดง'];
    const maliPet = createdPets['มะลิ'];
    const mochiPet = createdPets['โมจิ'];

    if (thuadangPet) {
      const existingApp = await prisma.application.findFirst({
        where: { petId: thuadangPet.id, applicantId: somchai.id },
      });
      if (!existingApp) {
        await prisma.application.create({
          data: {
            petId: thuadangPet.id,
            applicantId: somchai.id,
            readinessForm: {
              housing_type: 'บ้านเดี่ยว',
              income_range: '35,000 - 50,000 บาท/เดือน',
              experience: 'เคยเลี้ยงสุนัขพันธุ์ไทย 3 ปี',
              note: 'จำนวนสมาชิก/สัตว์เลี้ยงอื่น: 3\nเหตุผลที่อยากรับเลี้ยง: มีสนามหลังบ้านและมีเวลาพาวิ่งเล่นทุกวัน\nยอมรับเงื่อนไขการรับเลี้ยง: ยอมรับ',
            },
            status: 'PENDING',
          },
        });
      }
    }

    if (maliPet) {
      const existingApp = await prisma.application.findFirst({
        where: { petId: maliPet.id, applicantId: jaidee.id },
      });
      if (!existingApp) {
        await prisma.application.create({
          data: {
            petId: maliPet.id,
            applicantId: jaidee.id,
            readinessForm: {
              housing_type: 'คอนโดมิเนียม (Pet-Friendly)',
              income_range: '50,000 - 70,000 บาท/เดือน',
              experience: 'เคยเลี้ยงแมวระบบปิด 5 ปี',
              note: 'จำนวนสมาชิก/สัตว์เลี้ยงอื่น: 2\nเหตุผลที่อยากรับเลี้ยง: เลี้ยงระบบปิด มีความพร้อมด้านเวลาและค่ารักษาพยาบาล\nยอมรับเงื่อนไขการรับเลี้ยง: ยอมรับ',
            },
            status: 'PENDING',
          },
        });
      }
    }

    if (mochiPet) {
      const mochiAppExists = await prisma.application.findFirst({
        where: { petId: mochiPet.id, applicantId: jaidee.id },
      });
      if (!mochiAppExists) {
        await prisma.application.create({
          data: {
            petId: mochiPet.id,
            applicantId: jaidee.id,
            readinessForm: {
              housing_type: 'บ้านเดี่ยว',
              income_range: '50,000 - 70,000 บาท/เดือน',
              experience: 'เลี้ยงแมวมา 5 ปี',
              note: 'รับเลี้ยงน้องโมจิเรียบร้อย',
            },
            status: 'APPROVED',
          },
        });
      }
    }

    console.log('✅ Applications created for ถั่วแดง, มะลิ, and โมจิ');

    // 4. Create Messages (FR-05)
    console.log('4. Creating Messages...');
    if (thuadangPet) {
      const somchaiChatExists = await prisma.message.findFirst({
        where: { senderId: somchai.id, receiverId: demoOwner.id },
      });

      if (!somchaiChatExists) {
        await prisma.message.createMany({
          data: [
            {
              senderId: somchai.id,
              receiverId: demoOwner.id,
              content: 'สวัสดีครับ สนใจน้องถั่วแดง ได้ไหม',
              createdAt: new Date(Date.now() - 3600000 * 2),
            },
            {
              senderId: demoOwner.id,
              receiverId: somchai.id,
              content: 'ยินดีค่ะ มีพื้นที่ปล่อยวิ่งไหมคะ',
              createdAt: new Date(Date.now() - 3600000 * 1.5),
            },
            {
              senderId: somchai.id,
              receiverId: demoOwner.id,
              content: 'มีสนามหลังบ้านครับ',
              createdAt: new Date(Date.now() - 3600000),
            },
            {
              senderId: somchai.id,
              receiverId: demoOwner.id,
              content: 'พรุ่งนี้ไปดูได้ไหม',
              createdAt: new Date(Date.now() - 1800000),
            },
          ],
        });
      }
    }

    if (maliPet) {
      const jaideeChatExists = await prisma.message.findFirst({
        where: { senderId: jaidee.id, receiverId: demoOwner.id },
      });

      if (!jaideeChatExists) {
        await prisma.message.createMany({
          data: [
            {
              senderId: jaidee.id,
              receiverId: demoOwner.id,
              content: 'สวัสดีค่ะ สอบถามข้อมูลน้องมะลิเพิ่มเติมค่ะ',
              createdAt: new Date(Date.now() - 86400000),
            },
            {
              senderId: demoOwner.id,
              receiverId: jaidee.id,
              content: 'สวัสดีค่ะ น้องน่ารัก เลี้ยงง่าย สุขภาพแข็งแรงค่ะ',
              createdAt: new Date(Date.now() - 86300000),
            },
            {
              senderId: jaidee.id,
              receiverId: demoOwner.id,
              content: 'ขอบคุณค่ะ',
              createdAt: new Date(Date.now() - 86200000),
            },
          ],
        });
      }
    }

    if (mochiPet) {
      const nidChatExists = await prisma.message.findFirst({
        where: { senderId: nid.id, receiverId: demoOwner.id },
      });

      if (!nidChatExists) {
        await prisma.message.createMany({
          data: [
            {
              senderId: nid.id,
              receiverId: demoOwner.id,
              content: 'สวัสดีค่ะ อยากสอบถามเรื่องน้องโมจิค่ะ',
              createdAt: new Date(Date.now() - 86400000 * 3),
            },
            {
              senderId: demoOwner.id,
              receiverId: nid.id,
              content: 'สวัสดีค่ะ ตอนนี้มีผู้สนใจยื่นแบบประเมินเข้ามาแล้วค่ะ',
              createdAt: new Date(Date.now() - 86400000 * 3 + 600000),
            },
            {
              senderId: nid.id,
              receiverId: demoOwner.id,
              content: '...',
              createdAt: new Date(Date.now() - 86400000 * 3 + 1200000),
            },
          ],
        });
      }
    }

    console.log('✅ Real messages created for chat threads');

    // 5. Create Wishlists (FR-06)
    console.log('5. Creating Wishlists...');
    for (const pName of ['ถั่วแดง', 'มะลิ', 'โมจิ']) {
      const p = createdPets[pName];
      if (p) {
        await prisma.wishlist.upsert({
          where: {
            userId_petId: {
              userId: demoOwner.id,
              petId: p.id,
            },
          },
          update: {},
          create: {
            userId: demoOwner.id,
            petId: p.id,
          },
        });
      }
    }
    console.log('✅ Wishlists created for demo user');

    // 6. Create Pet Updates (FR-07)
    console.log('6. Creating Pet Updates...');
    if (mochiPet) {
      const existingUpdate = await prisma.petUpdate.findFirst({
        where: { petId: mochiPet.id },
      });
      if (!existingUpdate) {
        await prisma.petUpdate.create({
          data: {
            petId: mochiPet.id,
            updatePeriod: '1m',
            description: 'น้องปรับตัวเข้ากับบ้านใหม่ได้ดี วิ่งเล่นในสนามหลังบ้านทุกวัน สุขภาพแข็งแรงดีครับ',
            images: [
              'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=500',
              'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=500',
              'https://images.unsplash.com/photo-1495360010541-f48722b34f7d?w=500',
            ],
          },
        });
      }
    }
    console.log('✅ Pet Updates created for โมจิ');

    // 7. Create Reviews (FR-10)
    console.log('7. Creating Reviews...');
    const reviewsToSeed = [
      {
        reviewerId: manee.id,
        targetId: demoOwner.id,
        rating: 5,
        comment: 'ส่งมอบสัตว์ตามจริง ดูแลและให้คำแนะนำดีมาก',
      },
      {
        reviewerId: demoOwner.id,
        targetId: somchai.id,
        rating: 5,
        comment: 'ดูแลดี ส่งรูปตามนัด',
      },
      {
        reviewerId: demoOwner.id,
        targetId: somchai.id,
        rating: 4,
        comment: 'ตอบเร็ว',
      },
      {
        reviewerId: demoOwner.id,
        targetId: jaidee.id,
        rating: 5,
        comment: 'ส่งรูปอัปเดตตรงเวลา สัตว์เลี้ยงมีความสุขมาก',
      },
      {
        reviewerId: demoOwner.id,
        targetId: jaidee.id,
        rating: 5,
        comment: 'สุภาพ ใส่ใจทุกรายละเอียด',
      },
    ];

    for (const rev of reviewsToSeed) {
      const exists = await prisma.review.findFirst({
        where: {
          reviewerId: rev.reviewerId,
          targetId: rev.targetId,
          comment: rev.comment,
        },
      });
      if (!exists) {
        await prisma.review.create({ data: rev });
      }
    }
    console.log('✅ Reviews created');

    console.log('\n🎉 Successfully created all real mockup data in database!');
  } catch (error) {
    console.error('❌ Error creating mock data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

mockData();
