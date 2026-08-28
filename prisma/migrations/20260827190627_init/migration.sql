-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "RoleKind" AS ENUM ('ADMIN', 'MANAGER', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('OFFICE', 'COLLEGE', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "StudentProgram" AS ENUM ('REGULAR', 'WEEKEND', 'EXTENSION');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TargetGroup" AS ENUM ('STUDENT', 'PEER', 'MANAGER');

-- CreateEnum
CREATE TYPE "SectionType" AS ENUM ('LIKERT_GRID', 'FREE_TEXT');

-- CreateEnum
CREATE TYPE "Term" AS ENUM ('FALL', 'SPRING', 'SUMMER');

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('EMAIL', 'INSTANT');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "AudienceMode" AS ENUM ('REGISTERED_ONLY', 'GUEST_ALLOWED');

-- CreateEnum
CREATE TYPE "RespondentKind" AS ENUM ('STUDENT', 'PEER', 'MANAGER', 'GUEST');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailLower" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "kind" "RoleKind" NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","kind")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "emailLower" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "intendedRole" "RoleKind" NOT NULL,
    "hierarchyNodeId" TEXT,
    "managedByNodeId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HierarchyNode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "type" "NodeType" NOT NULL DEFAULT 'DEPARTMENT',
    "userId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HierarchyNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HierarchyEdge" (
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,

    CONSTRAINT "HierarchyEdge_pkey" PRIMARY KEY ("parentId","childId")
);

-- CreateTable
CREATE TABLE "HierarchyClosure" (
    "ancestorId" TEXT NOT NULL,
    "descendantId" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,

    CONSTRAINT "HierarchyClosure_pkey" PRIMARY KEY ("ancestorId","descendantId")
);

-- CreateTable
CREATE TABLE "Membership" (
    "userId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "kind" "RoleKind" NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("userId","nodeId","kind")
);

-- CreateTable
CREATE TABLE "StudentGroup" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "program" "StudentProgram" NOT NULL DEFAULT 'REGULAR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentGroupMember" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "StudentGroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

-- CreateTable
CREATE TABLE "LikertScale" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerNodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LikertScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LikertPoint" (
    "id" TEXT NOT NULL,
    "scaleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "LikertPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetGroup" "TargetGroup" NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerNodeId" TEXT NOT NULL,
    "clonedFromId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateSection" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "SectionType" NOT NULL,
    "scaleId" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isOverall" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,

    CONSTRAINT "TemplateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateItem" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,

    CONSTRAINT "TemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" TEXT NOT NULL,
    "academicYear" INTEGER NOT NULL,
    "term" "Term" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "semesterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CampaignType" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "audienceMode" "AudienceMode" NOT NULL DEFAULT 'REGISTERED_ONLY',
    "publicSlug" TEXT,
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "maxResponses" INTEGER,
    "minResponses" INTEGER NOT NULL DEFAULT 5,
    "minTeachers" INTEGER NOT NULL DEFAULT 1,
    "minStudents" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTemplate" (
    "campaignId" TEXT NOT NULL,
    "targetGroup" "TargetGroup" NOT NULL,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "CampaignTemplate_pkey" PRIMARY KEY ("campaignId","targetGroup")
);

-- CreateTable
CREATE TABLE "CampaignAssignment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "targetGroup" "TargetGroup" NOT NULL,
    "studentGroupId" TEXT,
    "respondentUserId" TEXT,

    CONSTRAINT "CampaignAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponseTask" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "respondentId" TEXT NOT NULL,
    "targetGroup" "TargetGroup" NOT NULL,
    "templateId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "lastEmailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResponseTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "respondentKind" "RespondentKind" NOT NULL,
    "respondentUserId" TEXT,
    "ballotId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "pointValue" INTEGER,
    "text" TEXT,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ballot" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ballot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailLower_key" ON "User"("emailLower");

-- CreateIndex
CREATE INDEX "User_emailLower_idx" ON "User"("emailLower");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_emailLower_idx" ON "Invitation"("emailLower");

-- CreateIndex
CREATE UNIQUE INDEX "HierarchyNode_userId_key" ON "HierarchyNode"("userId");

-- CreateIndex
CREATE INDEX "HierarchyNode_level_idx" ON "HierarchyNode"("level");

-- CreateIndex
CREATE INDEX "HierarchyEdge_childId_idx" ON "HierarchyEdge"("childId");

-- CreateIndex
CREATE INDEX "HierarchyClosure_descendantId_idx" ON "HierarchyClosure"("descendantId");

-- CreateIndex
CREATE INDEX "Membership_nodeId_idx" ON "Membership"("nodeId");

-- CreateIndex
CREATE INDEX "StudentGroup_nodeId_idx" ON "StudentGroup"("nodeId");

-- CreateIndex
CREATE INDEX "StudentGroupMember_userId_idx" ON "StudentGroupMember"("userId");

-- CreateIndex
CREATE INDEX "LikertScale_ownerNodeId_idx" ON "LikertScale"("ownerNodeId");

-- CreateIndex
CREATE INDEX "LikertPoint_scaleId_idx" ON "LikertPoint"("scaleId");

-- CreateIndex
CREATE INDEX "Template_ownerNodeId_idx" ON "Template"("ownerNodeId");

-- CreateIndex
CREATE INDEX "Template_status_idx" ON "Template"("status");

-- CreateIndex
CREATE INDEX "TemplateSection_templateId_idx" ON "TemplateSection"("templateId");

-- CreateIndex
CREATE INDEX "TemplateItem_sectionId_idx" ON "TemplateItem"("sectionId");

-- CreateIndex
CREATE INDEX "Semester_startsAt_idx" ON "Semester"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_academicYear_term_key" ON "Semester"("academicYear", "term");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_publicSlug_key" ON "Campaign"("publicSlug");

-- CreateIndex
CREATE INDEX "Campaign_nodeId_idx" ON "Campaign"("nodeId");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_semesterId_idx" ON "Campaign"("semesterId");

-- CreateIndex
CREATE INDEX "CampaignAssignment_campaignId_teacherId_idx" ON "CampaignAssignment"("campaignId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "ResponseTask_tokenHash_key" ON "ResponseTask"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ResponseTask_campaignId_teacherId_respondentId_key" ON "ResponseTask"("campaignId", "teacherId", "respondentId");

-- CreateIndex
CREATE UNIQUE INDEX "Response_ballotId_key" ON "Response"("ballotId");

-- CreateIndex
CREATE INDEX "Response_teacherId_campaignId_idx" ON "Response"("teacherId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Response_campaignId_teacherId_respondentUserId_key" ON "Response"("campaignId", "teacherId", "respondentUserId");

-- CreateIndex
CREATE INDEX "Answer_responseId_idx" ON "Answer"("responseId");

-- CreateIndex
CREATE INDEX "Answer_itemId_idx" ON "Answer"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Ballot_tokenHash_key" ON "Ballot"("tokenHash");

-- CreateIndex
CREATE INDEX "Ballot_campaignId_teacherId_idx" ON "Ballot"("campaignId", "teacherId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HierarchyNode" ADD CONSTRAINT "HierarchyNode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HierarchyEdge" ADD CONSTRAINT "HierarchyEdge_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "HierarchyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HierarchyEdge" ADD CONSTRAINT "HierarchyEdge_childId_fkey" FOREIGN KEY ("childId") REFERENCES "HierarchyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HierarchyClosure" ADD CONSTRAINT "HierarchyClosure_ancestorId_fkey" FOREIGN KEY ("ancestorId") REFERENCES "HierarchyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HierarchyClosure" ADD CONSTRAINT "HierarchyClosure_descendantId_fkey" FOREIGN KEY ("descendantId") REFERENCES "HierarchyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "HierarchyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGroup" ADD CONSTRAINT "StudentGroup_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "HierarchyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGroupMember" ADD CONSTRAINT "StudentGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StudentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGroupMember" ADD CONSTRAINT "StudentGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LikertScale" ADD CONSTRAINT "LikertScale_ownerNodeId_fkey" FOREIGN KEY ("ownerNodeId") REFERENCES "HierarchyNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LikertPoint" ADD CONSTRAINT "LikertPoint_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "LikertScale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_ownerNodeId_fkey" FOREIGN KEY ("ownerNodeId") REFERENCES "HierarchyNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_clonedFromId_fkey" FOREIGN KEY ("clonedFromId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSection" ADD CONSTRAINT "TemplateSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSection" ADD CONSTRAINT "TemplateSection_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "LikertScale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateItem" ADD CONSTRAINT "TemplateItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TemplateSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "HierarchyNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTemplate" ADD CONSTRAINT "CampaignTemplate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTemplate" ADD CONSTRAINT "CampaignTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAssignment" ADD CONSTRAINT "CampaignAssignment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAssignment" ADD CONSTRAINT "CampaignAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAssignment" ADD CONSTRAINT "CampaignAssignment_studentGroupId_fkey" FOREIGN KEY ("studentGroupId") REFERENCES "StudentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAssignment" ADD CONSTRAINT "CampaignAssignment_respondentUserId_fkey" FOREIGN KEY ("respondentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseTask" ADD CONSTRAINT "ResponseTask_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseTask" ADD CONSTRAINT "ResponseTask_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseTask" ADD CONSTRAINT "ResponseTask_respondentId_fkey" FOREIGN KEY ("respondentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseTask" ADD CONSTRAINT "ResponseTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_respondentUserId_fkey" FOREIGN KEY ("respondentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_ballotId_fkey" FOREIGN KEY ("ballotId") REFERENCES "Ballot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "TemplateItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ballot" ADD CONSTRAINT "Ballot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ballot" ADD CONSTRAINT "Ballot_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
