CREATE TYPE "PetType" AS ENUM ('Dog', 'Cat', 'Rabbit', 'Bird', 'Other');

UPDATE "pets"
SET "type" = CASE LOWER(TRIM("type"))
    WHEN 'dog' THEN 'Dog'
    WHEN 'สุนัข' THEN 'Dog'
    WHEN 'cat' THEN 'Cat'
    WHEN 'แมว' THEN 'Cat'
    WHEN 'rabbit' THEN 'Rabbit'
    WHEN 'กระต่าย' THEN 'Rabbit'
    WHEN 'bird' THEN 'Bird'
    WHEN 'นก' THEN 'Bird'
    WHEN 'other' THEN 'Other'
    WHEN 'อื่นๆ' THEN 'Other'
    ELSE 'Other'
END;

ALTER TABLE "pets"
ALTER COLUMN "type" TYPE "PetType"
USING "type"::"PetType";

UPDATE "pet_updates"
SET "update_period" = CASE LOWER(TRIM("update_period"))
    WHEN '1 เดือน' THEN '1m'
    WHEN '1_month' THEN '1m'
    WHEN '3 เดือน' THEN '3m'
    WHEN '3_months' THEN '3m'
    WHEN '5 เดือน' THEN '5m'
    WHEN '5_months' THEN '5m'
    WHEN '6 เดือน' THEN '5m'
    WHEN '6_months' THEN '5m'
    WHEN '6m' THEN '5m'
    WHEN '1 ปี' THEN '1y'
    WHEN '1_year' THEN '1y'
    ELSE "update_period"
END;

ALTER TABLE "messages"
ADD COLUMN "pet_id" TEXT;

CREATE INDEX "messages_pet_id_created_at_idx"
ON "messages"("pet_id", "created_at");

ALTER TABLE "messages"
ADD CONSTRAINT "messages_pet_id_fkey"
FOREIGN KEY ("pet_id") REFERENCES "pets"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
