DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommunicationAudience') THEN
    CREATE TYPE "CommunicationAudience" AS ENUM ('ALL', 'STUDENT', 'TEACHER', 'PARENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommunicationChannel') THEN
    CREATE TYPE "CommunicationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommunicationStatus') THEN
    CREATE TYPE "CommunicationStatus" AS ENUM ('DRAFT', 'SENT', 'SCHEDULED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ParentProfile" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ParentStudentLink" (
  "id" SERIAL NOT NULL,
  "parentId" INTEGER NOT NULL,
  "studentId" INTEGER NOT NULL,
  "relationType" TEXT NOT NULL DEFAULT 'Guardian',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentStudentLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CommunicationMessage" (
  "id" SERIAL NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "audienceType" "CommunicationAudience" NOT NULL,
  "channel" "CommunicationChannel" NOT NULL DEFAULT 'IN_APP',
  "status" "CommunicationStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" INTEGER,
  "recipientStudentId" INTEGER,
  "recipientTeacherId" INTEGER,
  "recipientParentId" INTEGER,
  "scheduledAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunicationMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" SERIAL NOT NULL,
  "actorUserId" INTEGER,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "summary" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ParentProfile_userId_key" ON "ParentProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ParentStudentLink_parentId_studentId_key" ON "ParentStudentLink"("parentId", "studentId");
CREATE INDEX IF NOT EXISTS "ParentStudentLink_studentId_idx" ON "ParentStudentLink"("studentId");
CREATE INDEX IF NOT EXISTS "CommunicationMessage_audienceType_status_createdAt_idx" ON "CommunicationMessage"("audienceType", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "CommunicationMessage_recipientStudentId_createdAt_idx" ON "CommunicationMessage"("recipientStudentId", "createdAt");
CREATE INDEX IF NOT EXISTS "CommunicationMessage_recipientTeacherId_createdAt_idx" ON "CommunicationMessage"("recipientTeacherId", "createdAt");
CREATE INDEX IF NOT EXISTS "CommunicationMessage_recipientParentId_createdAt_idx" ON "CommunicationMessage"("recipientParentId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ParentProfile_userId_fkey'
  ) THEN
    ALTER TABLE "ParentProfile"
      ADD CONSTRAINT "ParentProfile_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ParentStudentLink_parentId_fkey'
  ) THEN
    ALTER TABLE "ParentStudentLink"
      ADD CONSTRAINT "ParentStudentLink_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "ParentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ParentStudentLink_studentId_fkey'
  ) THEN
    ALTER TABLE "ParentStudentLink"
      ADD CONSTRAINT "ParentStudentLink_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CommunicationMessage_createdById_fkey'
  ) THEN
    ALTER TABLE "CommunicationMessage"
      ADD CONSTRAINT "CommunicationMessage_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CommunicationMessage_recipientStudentId_fkey'
  ) THEN
    ALTER TABLE "CommunicationMessage"
      ADD CONSTRAINT "CommunicationMessage_recipientStudentId_fkey"
      FOREIGN KEY ("recipientStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CommunicationMessage_recipientTeacherId_fkey'
  ) THEN
    ALTER TABLE "CommunicationMessage"
      ADD CONSTRAINT "CommunicationMessage_recipientTeacherId_fkey"
      FOREIGN KEY ("recipientTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CommunicationMessage_recipientParentId_fkey'
  ) THEN
    ALTER TABLE "CommunicationMessage"
      ADD CONSTRAINT "CommunicationMessage_recipientParentId_fkey"
      FOREIGN KEY ("recipientParentId") REFERENCES "ParentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_actorUserId_fkey'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
