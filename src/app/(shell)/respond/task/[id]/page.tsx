import { requireUser } from "@/server/auth/session";
import { getFormByTaskId, NotFoundError } from "@/server/responses/responses";
import TaskFormClient from "./TaskFormClient";
import FormTerminalState from "@/components/respond/FormTerminalState";

export default async function TaskFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  try {
    const form = await getFormByTaskId(id, user.id);
    if (form.completed) {
      return (
        <div>
          <FormTerminalState kind="already" embedded />
        </div>
      );
    }
    return <TaskFormClient taskId={id} form={form} />;
  } catch (e) {
    if (e instanceof NotFoundError) {
      return <FormTerminalState kind="invalid" embedded />;
    }
    throw e;
  }
}
