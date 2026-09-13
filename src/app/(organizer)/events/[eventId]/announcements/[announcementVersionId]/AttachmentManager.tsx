"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadFileToSignedUrl } from "@/lib/storage/uploadToSignedUrl";
import { MAX_UPLOAD_BYTES } from "@/lib/storage/uploadLimits";

type Attachment = { id: string; fileId: string; filename: string };
type ActionResult = { ok: true } | { ok: false; error: string };
type CreateUploadUrlResult = { ok: true; storageKey: string; token: string } | { ok: false; error: string };

export function AttachmentManager({
  attachments,
  canEdit,
  createUploadUrlAction,
  finalizeUploadAction,
  deleteAction,
}: {
  attachments: Attachment[];
  canEdit: boolean;
  createUploadUrlAction: (filename: string, fileSize: number) => Promise<CreateUploadUrlResult>;
  finalizeUploadAction: (storageKey: string, filename: string, fileSize: number, contentType: string) => Promise<ActionResult>;
  deleteAction: (attachmentId: string) => Promise<ActionResult>;
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
        const urlResult = await createUploadUrlAction(file.name, file.size);
        if (!urlResult.ok) {
          setError(urlResult.error);
          break;
        }
        await uploadFileToSignedUrl(urlResult.storageKey, urlResult.token, file);
        const finalizeResult = await finalizeUploadAction(urlResult.storageKey, file.name, file.size, file.type);
        if (!finalizeResult.ok) {
          setError(finalizeResult.error);
          break;
        }
      }
      router.refresh();
    } catch (err) {
      // ネットワーク切断等、途中で例外が投げられるケースをここで確実に拾う
      // （catch漏れがあるとアップロード中のまま固まり、エラーも出ないまま反映されないため）。
      setError(err instanceof Error ? err.message : "アップロードに失敗しました。もう一度お試しください。");
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
    if (!canEdit || isUploading) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    await uploadFiles(files);
  }

  async function handleDelete(attachmentId: string) {
    setDeletingId(attachmentId);
    setError(null);
    const result = await deleteAction(attachmentId);
    if (!result.ok) {
      setError(result.error);
    } else {
      router.refresh();
    }
    setDeletingId(null);
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
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-muted">
              {isUploading && <Loader2 className="size-3.5 animate-spin" />}
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
          <p className="text-xs text-muted-foreground">
            選択すると自動的に追加されます（複数選択可、{MAX_UPLOAD_BYTES / 1024 / 1024}MBまで）。ここへファイルをドラッグ＆ドロップすることもできます。
          </p>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
