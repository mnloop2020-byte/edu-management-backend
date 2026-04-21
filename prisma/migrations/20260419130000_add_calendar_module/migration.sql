-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('CLASS', 'EXAM', 'ASSIGNMENT_DEADLINE', 'PAYMENT_DEADLINE');

-- CreateTable
CREATE TABLE "AcademicClass" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "teacherId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentClass" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,

    CONSTRAINT "StudentClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "EventType" NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "relatedStudentId" INTEGER,
    "relatedTeacherId" INTEGER,
    "relatedClassId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicClass_code_key" ON "AcademicClass"("code");

-- CreateIndex
CREATE INDEX "AcademicClass_teacherId_idx" ON "AcademicClass"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentClass_studentId_classId_key" ON "StudentClass"("studentId", "classId");

-- CreateIndex
CREATE INDEX "StudentClass_classId_idx" ON "StudentClass"("classId");

-- CreateIndex
CREATE INDEX "CalendarEvent_type_startAt_idx" ON "CalendarEvent"("type", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_relatedTeacherId_startAt_idx" ON "CalendarEvent"("relatedTeacherId", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_relatedStudentId_startAt_idx" ON "CalendarEvent"("relatedStudentId", "startAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_relatedClassId_startAt_idx" ON "CalendarEvent"("relatedClassId", "startAt");

-- AddForeignKey
ALTER TABLE "AcademicClass" ADD CONSTRAINT "AcademicClass_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentClass" ADD CONSTRAINT "StudentClass_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentClass" ADD CONSTRAINT "StudentClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "AcademicClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_relatedStudentId_fkey" FOREIGN KEY ("relatedStudentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_relatedTeacherId_fkey" FOREIGN KEY ("relatedTeacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_relatedClassId_fkey" FOREIGN KEY ("relatedClassId") REFERENCES "AcademicClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
