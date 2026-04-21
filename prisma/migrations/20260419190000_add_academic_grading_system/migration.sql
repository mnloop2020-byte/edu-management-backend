-- CreateEnum
CREATE TYPE "SemesterStatus" AS ENUM ('PLANNED', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AssessmentCode" AS ENUM ('MIDTERM', 'FINAL_EXAM', 'COURSEWORK');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('REGISTERED', 'WITHDRAWN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('PASS', 'FAIL', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "CalculationStatus" AS ENUM ('PENDING', 'INCOMPLETE', 'CALCULATED', 'FINALIZED');

-- CreateTable
CREATE TABLE "Institution" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" SERIAL NOT NULL,
    "institutionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "SemesterStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" SERIAL NOT NULL,
    "institutionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "creditHours" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingPolicy" (
    "id" SERIAL NOT NULL,
    "institutionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "passMinScore" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingPolicyComponent" (
    "id" SERIAL NOT NULL,
    "policyId" INTEGER NOT NULL,
    "code" "AssessmentCode" NOT NULL,
    "label" TEXT NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "maxScore" DECIMAL(5,2) NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GradingPolicyComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingPolicyBoundary" (
    "id" SERIAL NOT NULL,
    "policyId" INTEGER NOT NULL,
    "letterGrade" TEXT NOT NULL,
    "minScore" DECIMAL(5,2) NOT NULL,
    "maxScore" DECIMAL(5,2),
    "gradePoint" DECIMAL(3,2) NOT NULL,
    "isPassing" BOOLEAN NOT NULL,
    "includeInGpa" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GradingPolicyBoundary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectOffering" (
    "id" SERIAL NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "teacherId" INTEGER,
    "gradingPolicyId" INTEGER NOT NULL,
    "section" TEXT NOT NULL DEFAULT 'A',
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubjectOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentEnrollment" (
    "id" SERIAL NOT NULL,
    "studentId" INTEGER NOT NULL,
    "subjectOfferingId" INTEGER NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "gradingPolicyId" INTEGER NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'REGISTERED',
    "totalScore" DECIMAL(5,2),
    "finalLetterGrade" TEXT,
    "gradePoint" DECIMAL(3,2),
    "countsTowardsGpa" BOOLEAN NOT NULL DEFAULT true,
    "passStatus" "ResultStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "earnedCredits" INTEGER,
    "calculationStatus" "CalculationStatus" NOT NULL DEFAULT 'PENDING',
    "calculatedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentAssessment" (
    "id" SERIAL NOT NULL,
    "enrollmentId" INTEGER NOT NULL,
    "componentId" INTEGER NOT NULL,
    "rawScore" DECIMAL(5,2),
    "weightedScore" DECIMAL(5,2),
    "enteredById" INTEGER,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Semester_institutionId_status_idx" ON "Semester"("institutionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_institutionId_code_key" ON "Semester"("institutionId", "code");

-- CreateIndex
CREATE INDEX "Subject_institutionId_isActive_idx" ON "Subject"("institutionId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_institutionId_code_key" ON "Subject"("institutionId", "code");

-- CreateIndex
CREATE INDEX "GradingPolicy_institutionId_isDefault_idx" ON "GradingPolicy"("institutionId", "isDefault");

-- CreateIndex
CREATE INDEX "GradingPolicyComponent_policyId_sortOrder_idx" ON "GradingPolicyComponent"("policyId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "GradingPolicyComponent_policyId_code_key" ON "GradingPolicyComponent"("policyId", "code");

-- CreateIndex
CREATE INDEX "GradingPolicyBoundary_policyId_sortOrder_idx" ON "GradingPolicyBoundary"("policyId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "GradingPolicyBoundary_policyId_letterGrade_key" ON "GradingPolicyBoundary"("policyId", "letterGrade");

-- CreateIndex
CREATE INDEX "SubjectOffering_teacherId_semesterId_idx" ON "SubjectOffering"("teacherId", "semesterId");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectOffering_subjectId_semesterId_section_key" ON "SubjectOffering"("subjectId", "semesterId", "section");

-- CreateIndex
CREATE INDEX "StudentEnrollment_studentId_semesterId_passStatus_idx" ON "StudentEnrollment"("studentId", "semesterId", "passStatus");

-- CreateIndex
CREATE UNIQUE INDEX "StudentEnrollment_studentId_subjectOfferingId_key" ON "StudentEnrollment"("studentId", "subjectOfferingId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentEnrollment_studentId_semesterId_subjectId_key" ON "StudentEnrollment"("studentId", "semesterId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentAssessment_enrollmentId_componentId_key" ON "EnrollmentAssessment"("enrollmentId", "componentId");

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingPolicy" ADD CONSTRAINT "GradingPolicy_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingPolicyComponent" ADD CONSTRAINT "GradingPolicyComponent_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "GradingPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingPolicyBoundary" ADD CONSTRAINT "GradingPolicyBoundary_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "GradingPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectOffering" ADD CONSTRAINT "SubjectOffering_gradingPolicyId_fkey" FOREIGN KEY ("gradingPolicyId") REFERENCES "GradingPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_subjectOfferingId_fkey" FOREIGN KEY ("subjectOfferingId") REFERENCES "SubjectOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_gradingPolicyId_fkey" FOREIGN KEY ("gradingPolicyId") REFERENCES "GradingPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentAssessment" ADD CONSTRAINT "EnrollmentAssessment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentAssessment" ADD CONSTRAINT "EnrollmentAssessment_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "GradingPolicyComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
