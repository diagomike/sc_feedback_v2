import { requireUser } from "@/server/auth/session";
import { getMyTasks } from "@/server/responses/responses";
import TasksClient from "./TasksClient";

export default async function TasksPage() {
  const user = await requireUser();
  const data = await getMyTasks(user.id);
  return <TasksClient pending={data.pending} completed={data.completed} />;
}
