"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Attachment = { id: string; fileId: string; filename: string };

export function AttachmentManager({
  attachments,
  canEdit,
  uploadAction,
  deleteAction,
}: {
  attachments: Attachment[];
  canEdit: boolean;
  uploadAction: (formData: FormData) => Promise<void>;
  deleteAction: (attachmentId: string) => Promise<void>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        await uploadAction(formData);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました。");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(attachmentId: string) {
    setDeletingId(attachmentId);
    setError(null);
    try {
      await deleteAction(attachmentId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました。");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {attachments.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {attachments.map((att) => (
            <li key={att.id} className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-1.5">
              <a
                href={`/api/files/${att.fileId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                {att.filename}
              </a>
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={deletingId === att.id}
                  onClick={() => handleDelete(att.id)}
                  className="size-7 text-muted-foreground hover:text-destructive"
                  aria-label={`${att.filename}を削除`}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div>
          <label className="w-fit cursor-pointer">
            <span className="inline-flex items-center rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted">
              {isUploading ? "アップロード中..." : "ファイルを選択して追加"}
            </span>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFilesSelected}
              disabled={isUploading}
            />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">選択すると自動的に追加されます（複数選択可）。</p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
