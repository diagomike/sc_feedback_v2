import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as argon2 from "argon2";
import { bootstrapProduction } from "../../prisma/bootstrap";
import { clearDatabase, createTestPrisma } from "../support/test-db";

const prisma = createTestPrisma();
const input = {
  adminName: "Release Administrator",
  adminEmail: "release.admin@example.test",
  adminPassword: "bootstrap-test-password",
};

describe.sequential("production bootstrap", () => {
  beforeAll(async () => clearDatabase(prisma));

  afterAll(async () => {
    await clearDatabase(prisma);
    await prisma.$disconnect();
  });

  it("creates only the administrator, unoccupied root, scales, and official defaults", async () => {
    const result = await bootstrapProduction(prisma, input);
    expect(result).toEqual({ admin: "created", root: "created", scalesCreated: 1, templatesCreated: 3 });

    const admin = await prisma.user.findUniqueOrThrow({
      where: { emailLower: input.adminEmail },
      include: { roles: true },
    });
    expect(admin).toMatchObject({ name: input.adminName, status: "ACTIVE" });
    expect(admin.roles.map((role) => role.kind)).toEqual(["ADMIN"]);
    expect(await argon2.verify(admin.passwordHash!, input.adminPassword)).toBe(true);

    const root = await prisma.hierarchyNode.findFirstOrThrow({ where: { name: "ASTU · Academic VP" } });
    expect(root).toMatchObject({ level: 0, type: "OFFICE", active: true, userId: null });
    expect(await prisma.hierarchyClosure.findUnique({
      where: { ancestorId_descendantId: { ancestorId: root.id, descendantId: root.id } },
    })).toMatchObject({ depth: 0 });
    expect(await prisma.semester.count()).toBe(0);
    expect(await prisma.template.count({ where: { status: "PUBLISHED", isDefault: true, ownerNodeId: root.id } })).toBe(3);
    expect(await prisma.campaign.count()).toBe(0);
  });

  it("is idempotent and never resets the administrator password", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { emailLower: input.adminEmail } });
    const result = await bootstrapProduction(prisma, { ...input, adminPassword: "a-different-password" });
    const after = await prisma.user.findUniqueOrThrow({ where: { emailLower: input.adminEmail } });

    expect(result).toEqual({ admin: "existing", root: "existing", scalesCreated: 0, templatesCreated: 0 });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(await prisma.hierarchyNode.count()).toBe(1);
    expect(await prisma.likertScale.count()).toBe(1);
    expect(await prisma.template.count()).toBe(3);
  });
});
