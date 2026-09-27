"use client";

import { useActionState } from "react";
import { saveProjectAction } from "@/server/actions/projects";
import type { ActionState } from "@/server/actions/run";
import { ProjectFields } from "@/components/project-fields";
import { FormError, SubmitButton } from "@/components/form-status";

export function NewProjectForm({ customers }: { customers: { id: string; name: string }[] }) {
  const [state, action] = useActionState<ActionState, FormData>(saveProjectAction, {});
  return (
    <form action={action} className="space-y-4">
      <ProjectFields customers={customers} />
      <FormError state={state} />
      <SubmitButton size="lg">حفظ المشروع</SubmitButton>
    </form>
  );
}
