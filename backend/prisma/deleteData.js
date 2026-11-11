// prisma/deleteData.js
const { prisma, pool } = require('./client');

async function deleteData() {
  console.log('🗑️  Starting complete database deletion...');

  try {
    const deletedMessages = await prisma.message.deleteMany({});
    console.log(`✅ Deleted ${deletedMessages.count} messages`);

    const deletedReviews = await prisma.review.deleteMany({});
    console.log(`✅ Deleted ${deletedReviews.count} reviews`);

    const deletedPetUpdates = await prisma.petUpdate.deleteMany({});
    console.log(`✅ Deleted ${deletedPetUpdates.count} pet updates`);

    const deletedWishlists = await prisma.wishlist.deleteMany({});
    console.log(`✅ Deleted ${deletedWishlists.count} wishlists`);

    const deletedApplications = await prisma.application.deleteMany({});
    console.log(`✅ Deleted ${deletedApplications.count} applications`);

    const deletedPetImages = await prisma.petImage.deleteMany({});
    console.log(`✅ Deleted ${deletedPetImages.count} pet images`);

    const deletedPets = await prisma.pet.deleteMany({});
    console.log(`✅ Deleted ${deletedPets.count} pets`);

    const deletedUsers = await prisma.user.deleteMany({});
    console.log(`✅ Deleted ${deletedUsers.count} users`);

    console.log('\n✨ All data has been successfully deleted from the database! (Database is empty)');
  } catch (error) {
    console.error('❌ Error deleting database data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

deleteData();
