/**
 * Non-destructive production bootstrap.
 *
 * Creates only the records that cannot be created from a fresh application's UI:
 * the first administrator, the unoccupied ASTU root, the official scale, and the
 * three published default questionnaires. It is safe to run repeatedly and never
 * resets passwords or deletes data.
 *
 * Required environment variables:
 *   BOOTSTRAP_ADMIN_NAME
 *   BOOTSTRAP_ADMIN_EMAIL
 *   BOOTSTRAP_ADMIN_PASSWORD
 */
import { Prisma, PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import * as F from "./fixtures";

const ROOT_NAME = "ASTU · Academic VP";

export interface BootstrapInput {
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}

export interface BootstrapResult {
  admin: "created" | "existing";
  root: "created" | "existing";
  scalesCreated: number;
  templatesCreated: number;
}

function required(value: string | undefined, name: string): string {
  const cleaned = value?.trim();
  if (!cleaned) throw new Error(`${name} is required`);
  return cleaned;
}

export function bootstrapInputFromEnv(): BootstrapInput {
  const adminEmail = required(process.env.BOOTSTRAP_ADMIN_EMAIL, "BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL must be a valid email address");
  }
  const adminPassword = required(process.env.BOOTSTRAP_ADMIN_PASSWORD, "BOOTSTRAP_ADMIN_PASSWORD");
  if (adminPassword.length < 8) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters");
  return {
    adminName: required(process.env.BOOTSTRAP_ADMIN_NAME, "BOOTSTRAP_ADMIN_NAME"),
    adminEmail,
    adminPassword,
  };
}

function samePoints(
  actual: { label: string; value: number; order: number }[],
  expected: (typeof F.SCALES)[number]["points"],
): boolean {
  return actual.length === expected.length && actual.every((point, index) =>
    point.order === index + 1 && point.label === expected[index].label && point.value === expected[index].value,
  );
}

function assertOfficialTemplate(
  actual: Prisma.TemplateGetPayload<{
    include: { sections: { include: { items: true; scale: { include: { points: true } } } } };
  }>,
  expected: (typeof F.OFFICIAL_TEMPLATES)[number],
  rootId: string,
): void {
  if (
    actual.ownerNodeId !== rootId ||
    actual.targetGroup !== expected.targetGroup ||
    actual.status !== "PUBLISHED" ||
    !actual.isDefault ||
    actual.sections.length !== expected.sections.length
  ) {
    throw new Error(`Official template '${expected.title}' exists with conflicting metadata`);
  }

  const sections = [...actual.sections].sort((a, b) => a.order - b.order);
  for (const [index, fixture] of expected.sections.entries()) {
    const section = sections[index];
    const items = [...section.items].sort((a, b) => a.order - b.order);
    if (
      section.title !== fixture.title ||
      section.type !== fixture.type ||
      section.weight !== fixture.weight ||
      section.isOverall !== (fixture.isOverall ?? false) ||
      section.allowNotApplicable !== (fixture.allowNotApplicable ?? false) ||
      items.length !== fixture.items.length
    ) {
      throw new Error(`Official template '${expected.title}' has conflicting section '${fixture.title}'`);
    }
    for (const [itemIndex, expectedItem] of fixture.items.entries()) {
      const item = items[itemIndex];
      if (
        item.text !== expectedItem.text ||
        item.weight !== expectedItem.weight ||
        item.required !== expectedItem.required ||
        item.order !== itemIndex + 1
      ) {
        throw new Error(`Official template '${expected.title}' has conflicting items in '${fixture.title}'`);
      }
    }
    if (fixture.scaleKey) {
      const scale = F.SCALES.find((candidate) => candidate.key === fixture.scaleKey)!;
      if (!section.scale || section.scale.name !== scale.name || !samePoints(section.scale.points, scale.points)) {
        throw new Error(`Official template '${expected.title}' has a conflicting scale in '${fixture.title}'`);
      }
    } else if (section.scaleId != null) {
      throw new Error(`Official template '${expected.title}' unexpectedly assigns a scale to '${fixture.title}'`);
    }
  }
}

export async function bootstrapProduction(prisma: PrismaClient, input: BootstrapInput): Promise<BootstrapResult> {
  const emailLower = input.adminEmail.trim().toLowerCase();
  const passwordHash = await argon2.hash(input.adminPassword);

  return prisma.$transaction(async (tx) => {
    let admin: BootstrapResult["admin"] = "existing";
    const admins = await tx.user.findMany({
      where: { roles: { some: { kind: "ADMIN" } } },
      include: { roles: true },
    });
    const matchingAdmin = admins.find((user) => user.emailLower === emailLower);

    if (admins.length > 0 && !matchingAdmin) {
      throw new Error(
        `An administrator already exists (${admins.map((user) => user.email).join(", ")}); ` +
        "bootstrap will not add another administrator implicitly",
      );
    }
    if (matchingAdmin) {
      if (matchingAdmin.status !== "ACTIVE" || !matchingAdmin.passwordHash) {
        throw new Error(`Administrator '${matchingAdmin.email}' exists but is not an active password account`);
      }
    } else {
      const existingUser = await tx.user.findUnique({ where: { emailLower } });
      if (existingUser) {
        throw new Error(`User '${existingUser.email}' already exists without the ADMIN role`);
      }
      await tx.user.create({
        data: {
          name: input.adminName.trim(),
          email: emailLower,
          emailLower,
          passwordHash,
          status: "ACTIVE",
          roles: { create: { kind: "ADMIN" } },
        },
      });
      admin = "created";
    }

    let root: BootstrapResult["root"] = "existing";
    const matchingRoots = await tx.hierarchyNode.findMany({ where: { name: ROOT_NAME } });
    if (matchingRoots.length > 1) throw new Error(`Multiple hierarchy nodes are named '${ROOT_NAME}'`);
    let rootNode = matchingRoots[0];
    if (rootNode) {
      if (rootNode.level !== 0 || rootNode.type !== "OFFICE" || !rootNode.active) {
        throw new Error(`Hierarchy node '${ROOT_NAME}' exists with conflicting level, type, or status`);
      }
    } else {
      const nodeCount = await tx.hierarchyNode.count();
      if (nodeCount > 0) {
        throw new Error(`Hierarchy already contains ${nodeCount} node(s), but the required root '${ROOT_NAME}' is missing`);
      }
      rootNode = await tx.hierarchyNode.create({
        data: { name: ROOT_NAME, level: 0, type: "OFFICE" },
      });
      root = "created";
    }
    await tx.hierarchyClosure.upsert({
      where: { ancestorId_descendantId: { ancestorId: rootNode.id, descendantId: rootNode.id } },
      create: { ancestorId: rootNode.id, descendantId: rootNode.id, depth: 0 },
      update: { depth: 0 },
    });

    const scaleIdByKey = new Map<string, string>();
    let scalesCreated = 0;
    for (const fixture of F.SCALES) {
      const matches = await tx.likertScale.findMany({
        where: { name: fixture.name },
        include: { points: { orderBy: { order: "asc" } } },
      });
      if (matches.length > 1) throw new Error(`Multiple Likert scales are named '${fixture.name}'`);
      let scale = matches[0];
      if (scale) {
        if (!samePoints(scale.points, fixture.points)) {
          throw new Error(`Likert scale '${fixture.name}' exists with conflicting points`);
        }
      } else {
        scale = await tx.likertScale.create({
          data: {
            name: fixture.name,
            points: { create: fixture.points.map((point, index) => ({
              label: point.label,
              value: point.value,
              order: index + 1,
            })) },
          },
          include: { points: true },
        });
        scalesCreated += 1;
      }
      scaleIdByKey.set(fixture.key, scale.id);
    }

    let templatesCreated = 0;
    for (const fixture of F.OFFICIAL_TEMPLATES) {
      const matches = await tx.template.findMany({
        where: { title: fixture.title },
        include: {
          sections: {
            include: { items: true, scale: { include: { points: true } } },
          },
        },
      });
      if (matches.length > 1) throw new Error(`Multiple templates are titled '${fixture.title}'`);
      if (matches[0]) {
        assertOfficialTemplate(matches[0], fixture, rootNode.id);
        continue;
      }
      await tx.template.create({
        data: {
          title: fixture.title,
          targetGroup: fixture.targetGroup,
          status: "PUBLISHED",
          isDefault: true,
          publishedAt: new Date(),
          ownerNodeId: rootNode.id,
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
      templatesCreated += 1;
    }

    return { admin, root, scalesCreated, templatesCreated };
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await bootstrapProduction(prisma, bootstrapInputFromEnv());
    console.log("Production bootstrap complete");
    console.log(`  administrator: ${result.admin}`);
    console.log(`  ASTU root: ${result.root}`);
    console.log(`  scales created: ${result.scalesCreated}`);
    console.log(`  official templates created: ${result.templatesCreated}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/prisma/bootstrap.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
