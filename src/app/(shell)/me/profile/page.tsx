import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, email: true, phone: true } });
  return <ProfileClient profile={profile} />;
}
