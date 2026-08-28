import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { hashToken } from "@/server/auth/token";
import { effectiveCampaignStatus, validateAnswers, ValidationError, ClosedError } from "./response-validation";
import type { AnswerInput } from "@/lib/schemas/responses";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

const taskInclude = {
  teacher: true,
  campaign: true,
  template: {
    include: {
      sections: {
        orderBy: { order: "asc" as const },
        include: {
          items: { orderBy: { order: "asc" as const } },
          scale: { include: { points: { orderBy: { order: "asc" as const } } } },
        },
      },
    },
  },
} satisfies Prisma.ResponseTaskInclude;

type LoadedTask = Prisma.ResponseTaskGetPayload<{ include: typeof taskInclude }>;

function toFormDto(task: LoadedTask) {
  return {
    taskId: task.id,
    teacherName: task.teacher.name,
    campaignName: task.campaign.name,
    targetGroup: task.targetGroup,
    completed: task.completedAt != null,
    closesAt: task.campaign.closesAt,
    sections: task.template.sections.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      type: s.type,
      isOverall: s.isOverall,
      order: s.order,
      scale: s.scale ? s.scale.points.map((p) => ({ id: p.id, label: p.label, value: p.value, order: p.order })) : null,
      items: s.items.map((i) => ({ id: i.id, text: i.text, required: i.required, order: i.order })),
    })),
  };
}

async function loadTask(rawToken: string) {
  const task = await prisma.responseTask.findUnique({ where: { tokenHash: hashToken(rawToken) }, include: taskInclude });
  if (!task) throw new NotFoundError("This link is invalid or has expired");
  return task;
}

/** Ownership is checked and the same NotFoundError used for "not yours" as for "does
 *  not exist" — must never become a way to probe which task ids belong to someone else. */
async function loadTaskById(taskId: string, userId: string) {
  const task = await prisma.responseTask.findUnique({ where: { id: taskId }, include: taskInclude });
  if (!task || task.respondentId !== userId) throw new NotFoundError("This task does not exist");
  return task;
}

export async function getFormByToken(rawToken: string) {
  return toFormDto(await loadTask(rawToken));
}

export async function getFormByTaskId(taskId: string, userId: string) {
  return toFormDto(await loadTaskById(taskId, userId));
}

async function completeTask(task: LoadedTask, answers: AnswerInput[]): Promise<{ ok: true }> {
  if (task.completedAt) throw new ConflictError("This form has already been submitted");

  const effectiveStatus = await effectiveCampaignStatus(task.campaignId);
  if (effectiveStatus === "CLOSED") throw new ClosedError("This campaign is closed");

  validateAnswers(task.template.sections, answers);

  try {
    await prisma.$transaction(async (tx) => {
      const response = await tx.response.create({
        data: {
          campaignId: task.campaignId,
          teacherId: task.teacherId,
          templateId: task.templateId,
          respondentKind: task.targetGroup,
          respondentUserId: task.respondentId,
        },
      });
      await tx.answer.createMany({
        data: answers.map((a) => ({ responseId: response.id, itemId: a.itemId, pointValue: a.pointValue ?? null, text: a.text ?? null })),
      });
      await tx.responseTask.update({ where: { id: task.id }, data: { completedAt: new Date() } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("You have already submitted feedback for this teacher");
    }
    throw err;
  }

  return { ok: true };
}

export async function submitByToken(rawToken: string, answers: AnswerInput[]) {
  return completeTask(await loadTask(rawToken), answers);
}

export async function submitByTaskId(taskId: string, userId: string, answers: AnswerInput[]) {
  return completeTask(await loadTaskById(taskId, userId), answers);
}

/** Everything assigned to the signed-in respondent, split into pending and completed —
 *  the source for /respond/tasks and /respond/done. */
export async function getMyTasks(userId: string) {
  const now = new Date();
  const [pendingTasks, completedTasks] = await Promise.all([
    prisma.responseTask.findMany({
      where: { respondentId: userId, completedAt: null, campaign: { status: "OPEN", OR: [{ closesAt: null }, { closesAt: { gte: now } }] } },
      include: {
        teacher: { select: { name: true } },
        campaign: { select: { name: true, closesAt: true } },
        template: { include: { sections: { include: { items: { select: { id: true } } } } } },
      },
      orderBy: [{ campaign: { closesAt: "asc" } }, { createdAt: "asc" }],
    }),
    prisma.responseTask.findMany({
      where: { respondentId: userId, completedAt: { not: null } },
      include: { teacher: { select: { name: true } }, campaign: { select: { name: true } } },
      orderBy: { completedAt: "desc" },
    }),
  ]);

  const pending = pendingTasks.map((t) => {
    const itemCount = t.template.sections.reduce((sum, s) => sum + s.items.length, 0);
    return {
      taskId: t.id,
      teacherName: t.teacher.name,
      campaignName: t.campaign.name,
      targetGroup: t.targetGroup,
      itemCount,
      estimatedMinutes: Math.max(1, Math.round((itemCount * 15) / 60)),
      closesAt: t.campaign.closesAt,
    };
  });

  const completed = completedTasks.map((t) => ({
    taskId: t.id,
    teacherName: t.teacher.name,
    campaignName: t.campaign.name,
    targetGroup: t.targetGroup,
    completedAt: t.completedAt!,
  }));

  return { pending, completed };
}
