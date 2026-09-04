import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as argon2 from "argon2";
import { Prisma, PrismaClient, type RoleKind } from "@prisma/client";
import * as F from "../../prisma/fixtures";
import { computeClosureRows } from "../../src/server/hierarchy/closure-algorithm";

export const TEST_PASSWORD = "astu1234";
export const EXPIRED_SWE_INVITATION_TOKEN = "e2e-expired-swe-invitation";

export function loadTestEnv(): void {
  if (process.env.TEST_DATABASE_URL) return;
  const path = resolve(".env.test");
  if (existsSync(path)) process.loadEnvFile(path);
}

loadTestEnv();

export function requireTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error("TEST_DATABASE_URL is required for database-backed tests");

  const url = new URL(value);
  const database = url.pathname.replace(/^\//, "");
  if (!database.endsWith("_test")) {
    throw new Error(`Refusing to reset database '${database}': its name must end with _test`);
  }
  const development = process.env.DEVELOPMENT_DATABASE_URL;
  if (development && development === value) {
    throw new Error("Refusing to use the development database as TEST_DATABASE_URL");
  }
  return value;
}

export function createTestPrisma(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: requireTestDatabaseUrl() } } });
}

export async function clearDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.answer.deleteMany({});
  await prisma.response.deleteMany({});
  await prisma.ballot.deleteMany({});
  await prisma.responseTask.deleteMany({});
  await prisma.campaignAssignment.deleteMany({});
  await prisma.campaignTemplate.deleteMany({});
  await prisma.campaign.deleteMany({});
  await prisma.courseEnrollment.deleteMany({});
  await prisma.courseOffering.deleteMany({});
  await prisma.course.deleteMany({});
  await prisma.semester.deleteMany({});
  await prisma.templateItem.deleteMany({});
  await prisma.templateSection.deleteMany({});
  await prisma.template.deleteMany({});
  await prisma.likertPoint.deleteMany({});
  await prisma.likertScale.deleteMany({});
  await prisma.studentGroupMember.deleteMany({});
  await prisma.studentGroup.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.hierarchyClosure.deleteMany({});
  await prisma.hierarchyEdge.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.invitation.deleteMany({});
  await prisma.hierarchyNode.deleteMany({});
  await prisma.userRole.deleteMany({});
  await prisma.user.deleteMany({});
}

async function createUser(
  prisma: PrismaClient,
  sharedHash: string,
  input: {
    email: string;
    name: string;
    roles: RoleKind[];
    status?: "ACTIVE" | "INVITED" | "DISABLED";
  },
) {
  const status = input.status ?? "ACTIVE";
  return prisma.user.create({
    data: {
      email: input.email,
      emailLower: input.email.toLowerCase(),
      name: input.name,
      passwordHash: status === "ACTIVE" ? sharedHash : null,
      status,
      roles: { create: input.roles.map((kind) => ({ kind })) },
    },
  });
}

function tokenHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function activeSemesterDates(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  const month = start.getMonth();
  const term = month >= 8 ? "FALL" : month <= 4 ? "SPRING" : "SUMMER";
  const academicYear = term === "FALL" ? start.getFullYear() : start.getFullYear() - 1;
  return { start, end, term: term as "FALL" | "SPRING" | "SUMMER", academicYear };
}

export async function seedE2eBase(prisma: PrismaClient): Promise<void> {
  await clearDatabase(prisma);
  const sharedHash = await argon2.hash(TEST_PASSWORD);

  await createUser(prisma, sharedHash, {
    email: "admin@astu.edu.et",
    name: "System Administrator",
    roles: ["ADMIN"],
  });

  const nodeIdByKey = new Map<string, string>();
  for (const fixture of F.NODES) {
    let userId: string | null = null;
    if (fixture.head) {
      const invited = fixture.invite === "invited" || fixture.invite === "expired";
      const user = await createUser(prisma, sharedHash, {
        email: fixture.head.email,
        name: fixture.head.name,
        roles: fixture.headAlsoTeaches ? ["MANAGER", "TEACHER"] : ["MANAGER"],
        status: invited ? "INVITED" : "ACTIVE",
      });
      userId = user.id;
      if (fixture.invite) {
        const expired = fixture.invite === "expired";
        await prisma.invitation.create({
          data: {
            emailLower: fixture.head.email.toLowerCase(),
            tokenHash: tokenHash(
              fixture.key === "swe" ? EXPIRED_SWE_INVITATION_TOKEN : `e2e-${fixture.key}-invitation`,
            ),
            intendedRole: "MANAGER",
            expiresAt: new Date(Date.now() + (expired ? -3 : 6) * 86_400_000),
          },
        });
      }
    }
    const node = await prisma.hierarchyNode.create({
      data: { name: fixture.name, level: fixture.level, type: fixture.type, userId },
    });
    nodeIdByKey.set(fixture.key, node.id);
  }

  const edges: Prisma.HierarchyEdgeCreateManyInput[] = [];
  for (const fixture of F.NODES) {
    for (const parent of fixture.parents) {
      edges.push({ parentId: nodeIdByKey.get(parent)!, childId: nodeIdByKey.get(fixture.key)! });
    }
  }
  await prisma.hierarchyEdge.createMany({ data: edges });
  await prisma.hierarchyClosure.createMany({
    data: computeClosureRows([...nodeIdByKey.values()], edges),
  });

  const semester = activeSemesterDates();
  await prisma.semester.create({
    data: {
      academicYear: semester.academicYear,
      term: semester.term,
      startsAt: semester.start,
      endsAt: semester.end,
    },
  });

  const scaleIdByKey = new Map<string, string>();
  for (const fixture of F.SCALES) {
    const scale = await prisma.likertScale.create({
      data: {
        name: fixture.name,
        points: { create: fixture.points.map((point, index) => ({ label: point.label, value: point.value, order: index + 1 })) },
      },
    });
    scaleIdByKey.set(fixture.key, scale.id);
  }

  for (const fixture of F.OFFICIAL_TEMPLATES) {
    await prisma.template.create({
      data: {
        title: fixture.title,
        targetGroup: fixture.targetGroup,
        status: "PUBLISHED",
        isDefault: true,
        publishedAt: new Date(),
        ownerNodeId: nodeIdByKey.get("astu")!,
        sections: {
          create: fixture.sections.map((section, sectionIndex) => ({
            title: section.title,
            type: section.type,
            scaleId: section.scaleKey ? scaleIdByKey.get(section.scaleKey)! : null,
            weight: section.weight,
            isOverall: section.isOverall ?? false,
            allowNotApplicable: section.allowNotApplicable ?? false,
            order: sectionIndex + 1,
            items: {
              create: section.items.map((item, itemIndex) => ({
                text: item.text,
                weight: item.weight,
                required: item.required,
                order: itemIndex + 1,
              })),
            },
          })),
        },
      },
    });
  }
}
