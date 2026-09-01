-- DropIndex
DROP INDEX "Response_campaignId_teacherId_respondentUserId_key";

-- DropIndex
DROP INDEX "ResponseTask_campaignId_teacherId_respondentId_key";

-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "notApplicable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CampaignAssignment" ADD COLUMN     "courseOfferingId" TEXT;

-- AlterTable
ALTER TABLE "Response" ADD COLUMN     "courseOfferingId" TEXT,
ADD COLUMN     "offeringKey" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ResponseTask" ADD COLUMN     "courseOfferingId" TEXT,
ADD COLUMN     "offeringKey" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "StudentGroup" ADD COLUMN     "classYear" TEXT,
ADD COLUMN     "sectionLabel" TEXT;

-- AlterTable
ALTER TABLE "TemplateSection" ADD COLUMN     "allowNotApplicable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "externalId" TEXT;

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "nodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseOffering" (
    "id" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "studentGroupId" TEXT NOT NULL,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseEnrollment" (
    "offeringId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("offeringId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");

-- CreateIndex
CREATE INDEX "Course_nodeId_idx" ON "Course"("nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseOffering_externalId_key" ON "CourseOffering"("externalId");

-- CreateIndex
CREATE INDEX "CourseOffering_semesterId_teacherId_idx" ON "CourseOffering"("semesterId", "teacherId");

-- CreateIndex
CREATE INDEX "CourseOffering_studentGroupId_idx" ON "CourseOffering"("studentGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseOffering_semesterId_courseId_teacherId_studentGroupId_key" ON "CourseOffering"("semesterId", "courseId", "teacherId", "studentGroupId");

-- CreateIndex
CREATE INDEX "CourseEnrollment_userId_idx" ON "CourseEnrollment"("userId");

-- CreateIndex
CREATE INDEX "Response_courseOfferingId_idx" ON "Response"("courseOfferingId");

-- CreateIndex
CREATE UNIQUE INDEX "Response_campaignId_teacherId_respondentUserId_offeringKey_key" ON "Response"("campaignId", "teacherId", "respondentUserId", "offeringKey");

-- CreateIndex
CREATE UNIQUE INDEX "ResponseTask_campaignId_teacherId_respondentId_offeringKey_key" ON "ResponseTask"("campaignId", "teacherId", "respondentId", "offeringKey");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGroup_nodeId_classYear_sectionLabel_key" ON "StudentGroup"("nodeId", "classYear", "sectionLabel");

-- CreateIndex
CREATE UNIQUE INDEX "User_externalId_key" ON "User"("externalId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "HierarchyNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_studentGroupId_fkey" FOREIGN KEY ("studentGroupId") REFERENCES "StudentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "CourseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAssignment" ADD CONSTRAINT "CampaignAssignment_courseOfferingId_fkey" FOREIGN KEY ("courseOfferingId") REFERENCES "CourseOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseTask" ADD CONSTRAINT "ResponseTask_courseOfferingId_fkey" FOREIGN KEY ("courseOfferingId") REFERENCES "CourseOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_courseOfferingId_fkey" FOREIGN KEY ("courseOfferingId") REFERENCES "CourseOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

