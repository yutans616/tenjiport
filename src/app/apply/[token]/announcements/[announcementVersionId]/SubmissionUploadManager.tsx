"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";

type Submission = { id: string; fileId: string; filename: string };
type ActionResult = { ok: true } | { ok: false; error: string };

export function SubmissionUploadManager({
  submissions,
  uploadAction,
  deleteAction,
}: {
  submissions: Submission[];
  uploadAction: (formData: FormData) => Promise<ActionResult>;
  deleteAction: (submissionId: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setIsUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        const result = await uploadAction(formData);
        if (!result.ok) {
          setError(result.error);
          break;
        }
      }
      router.refresh();
    } finally {
      setIsUploading(false);
    }
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    await uploadFiles(files);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    await uploadFiles(Array.from(e.dataTransfer.files ?? []));
  }

  async function handleDelete(submissionId: string) {
    setDeletingId(submissionId);
    setError(null);
    const result = await deleteAction(submissionId);
    if (!result.ok) setError(result.error);
    else router.refresh();
    setDeletingId(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {submissions.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {submissions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-1.5">
              <a
                href={`/api/files/${s.fileId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                {s.filename}
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={deletingId === s.id}
                onClick={() => handleDelete(s.id)}
                className="size-7 text-muted-foreground hover:text-destructive"
                aria-label={`${s.filename}を削除`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
          isDragging ? "border-primary bg-primary/5" : "border-input"
        }`}
      >
        <UploadCloud className="size-5 text-muted-foreground" />
        <label className="cursor-pointer">
          <span className="inline-flex items-center rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted">
            {isUploading ? "アップロード中..." : "ファイルを選択して提出"}
          </span>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFilesSelected} disabled={isUploading} />
        </label>
        <p className="text-xs text-muted-foreground">
          選択すると自動的に提出されます（複数選択可）。ここへファイルをドラッグ＆ドロップすることもできます。
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
