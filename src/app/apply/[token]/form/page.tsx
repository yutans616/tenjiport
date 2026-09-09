import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SubmissionForm } from "./SubmissionForm";

export default async function ApplyFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/apply/${token}`);
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, name, status")
    .eq("public_form_token", token)
    .maybeSingle();

  if (!event) notFound();

  const { data: form } = await supabase
    .from("forms")
    .select("id")
    .eq("event_id", event.id)
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!form || event.status !== "open") {
    return (
      <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-lg font-semibold">現在、入力フォームは準備中です</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          主催者がイベントとフォームを公開すると入力できるようになります。
        </p>
      </main>
    );
  }

  const { data: sections } = await supabase
    .from("form_sections")
    .select("id, title, order, form_fields(id, key, label, type, required, help_text, order, options_json)")
    .eq("form_id", form.id)
    .order("order", { ascending: true });

  const { data: draftRows, error: draftError } = await supabase.rpc("start_or_resume_submission", {
    p_event_id: event.id,
  });

  if (draftError || !draftRows || draftRows.length === 0) {
    return (
      <main className="flex min-h-screen flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-lg font-semibold">入力を開始できませんでした</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {draftError?.message ?? "しばらくしてから再度お試しください。"}
        </p>
      </main>
    );
  }

  const draft = draftRows[0];

  let pendingRevisionComment: string | null = null;
  if (draft.version_number > 1) {
    const { data: previousVersion } = await supabase
      .from("submission_versions")
      .select("id")
      .eq("event_participation_id", draft.participation_id)
      .eq("version_number", draft.version_number - 1)
      .maybeSingle();
    if (previousVersion) {
      const { data: revisionRow } = await supabase
        .from("revision_requests")
        .select("comment")
        .eq("submission_version_id", previousVersion.id)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      pendingRevisionComment = revisionRow?.comment ?? null;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-1 flex-col gap-6 p-4 py-10">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{event.name}</p>
        <h1 className="text-lg font-semibold tracking-tight">出展者情報入力</h1>
      </div>
      {pendingRevisionComment && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
          <p className="font-medium">主催者より修正のご依頼が届いています</p>
          <p className="mt-1 whitespace-pre-wrap">{pendingRevisionComment}</p>
        </div>
      )}
      <SubmissionForm
        submissionVersionId={draft.submission_version_id}
        sections={sections ?? []}
        initialAnswers={(draft.data_snapshot_json as Record<string, unknown>) ?? {}}
        doneHref={`/apply/${token}/done`}
      />
    </main>
  );
}
