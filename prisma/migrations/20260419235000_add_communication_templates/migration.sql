DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TemplateStatus') THEN
    CREATE TYPE "TemplateStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CommunicationTemplate" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "audienceType" "CommunicationAudience" NOT NULL,
  "channel" "CommunicationChannel" NOT NULL DEFAULT 'IN_APP',
  "status" "TemplateStatus" NOT NULL DEFAULT 'ACTIVE',
  "subjectTemplate" TEXT NOT NULL,
  "bodyTemplate" TEXT NOT NULL,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunicationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CommunicationTemplate_status_audienceType_createdAt_idx"
  ON "CommunicationTemplate"("status", "audienceType", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'CommunicationMessage' AND column_name = 'templateId'
  ) THEN
    ALTER TABLE "CommunicationMessage" ADD COLUMN "templateId" INTEGER;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CommunicationMessage_templateId_idx"
  ON "CommunicationMessage"("templateId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CommunicationTemplate_createdById_fkey'
  ) THEN
    ALTER TABLE "CommunicationTemplate"
      ADD CONSTRAINT "CommunicationTemplate_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CommunicationMessage_templateId_fkey'
  ) THEN
    ALTER TABLE "CommunicationMessage"
      ADD CONSTRAINT "CommunicationMessage_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "CommunicationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
