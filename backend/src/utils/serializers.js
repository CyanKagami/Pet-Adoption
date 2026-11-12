function serializeApplication(application) {
  const form = application.readinessForm || {};
  const housingType = form.housing_type || form.housingType || '';
  const incomeRange = form.income_range || form.incomeRange || '';
  const petExperience = form.experience || form.petExperience || '';
  const additionalNote = form.note || form.additionalNote || '';
  const householdMembers = form.household_members ?? form.householdMembers;
  const adoptionReason = form.adoption_reason || form.adoptionReason;

  return {
    ...application,
    status: String(application.status).toLowerCase(),
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt?.toISOString(),
    readinessForm: {
      housingType,
      incomeRange,
      petExperience,
      ...(additionalNote && { additionalNote }),
      ...(householdMembers !== undefined && { householdMembers }),
      ...(adoptionReason && { adoptionReason }),
    },
    housingType,
    incomeRange,
    petExperience,
    ...(additionalNote && { additionalNote }),
    ...(householdMembers !== undefined && { householdMembers }),
    ...(adoptionReason && { adoptionReason }),
  };
}

module.exports = { serializeApplication };
