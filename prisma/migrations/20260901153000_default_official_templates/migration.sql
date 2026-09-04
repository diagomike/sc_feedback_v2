-- Mark the three official ASTU questionnaires as campaign defaults. The flag is data,
-- not a title convention at runtime; the UPDATE only backfills databases created before
-- the flag existed.
ALTER TABLE "Template" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Template"
SET "isDefault" = true
WHERE "title" IN (
  'ASTU Staff Evaluation - Students',
  'ASTU Staff Evaluation - Colleagues',
  'ASTU Staff Evaluation - Head of Department'
)
AND "status" = 'PUBLISHED';
