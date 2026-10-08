"use client";

import { useState, useTransition } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { FieldRow, type FieldRowData } from "./FieldRow";

export type SortableField = {
  field: FieldRowData;
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
};

type DropTarget = { id: string; position: "before" | "after" };

function moveId(order: string[], draggedId: string, target: DropTarget): string[] {
  const without = order.filter((id) => id !== draggedId);
  const targetIndex = without.indexOf(target.id);
  if (targetIndex === -1) return order;
  without.splice(target.position === "before" ? targetIndex : targetIndex + 1, 0, draggedId);
  return without;
}

// HTML5ドラッグ＆ドロップによる項目の並び替え（外部ライブラリ不要）。編集中の入力欄で
// 文字選択できなくなるのを避けるため、行全体ではなく左端のつまみを押した時だけ
// 行をdraggableにする。タッチ端末ではHTML5のDnDが効かないため、↑↓ボタンも残す。
export function SortableFieldList({
  fields,
  reorderAction,
}: {
  fields: SortableField[];
  reorderAction: (orderedFieldIds: string[]) => Promise<void>;
}) {
  const serverOrder = fields.map((f) => f.field.id);
  const serverKey = serverOrder.join(",");
  const [order, setOrder] = useState(serverOrder);
  const [syncedKey, setSyncedKey] = useState(serverKey);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 項目の追加・削除・保存後の再描画で、サーバー側の並びを正とする。
  if (serverKey !== syncedKey) {
    setSyncedKey(serverKey);
    setOrder(serverOrder);
  }

  const byId = new Map(fields.map((f) => [f.field.id, f]));
  const visibleOrder = order.filter((id) => byId.has(id));

  function commit(next: string[]) {
    if (next.join(",") === visibleOrder.join(",")) return;
    const previous = visibleOrder;
    setOrder(next);
    setError(null);
    startTransition(async () => {
      try {
        await reorderAction(next);
      } catch (err) {
        setOrder(previous);
        setError(err instanceof Error ? err.message : "並び替えの保存に失敗しました。");
      }
    });
  }

  function resetDrag() {
    setArmedId(null);
    setDraggingId(null);
    setDropTarget(null);
  }

  return (
    <div className="flex flex-col gap-1">
      <ul className={cn("flex flex-col gap-2", isPending && "opacity-70")}>
        {visibleOrder.map((id, index) => {
          const item = byId.get(id)!;
          const showBefore = dropTarget?.id === id && dropTarget.position === "before" && draggingId !== id;
          const showAfter = dropTarget?.id === id && dropTarget.position === "after" && draggingId !== id;
          return (
            <FieldRow
              key={id}
              field={item.field}
              updateAction={item.updateAction}
              deleteAction={item.deleteAction}
              onMoveUp={index === 0 ? undefined : () => commit(moveId(visibleOrder, id, { id: visibleOrder[index - 1], position: "before" }))}
              onMoveDown={
                index === visibleOrder.length - 1
                  ? undefined
                  : () => commit(moveId(visibleOrder, id, { id: visibleOrder[index + 1], position: "after" }))
              }
              dragHandle={
                <span
                  className="-ml-1 flex cursor-grab touch-none items-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
                  title="ドラッグして並び替え"
                  aria-hidden
                  onMouseDown={() => setArmedId(id)}
                  onMouseUp={() => setArmedId(null)}
                >
                  <GripVertical className="size-4" />
                </span>
              }
              containerProps={{
                draggable: armedId === id,
                onDragStart: (e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", id);
                  setDraggingId(id);
                },
                onDragOver: (e) => {
                  if (!draggingId) return;
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const position = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  if (dropTarget?.id !== id || dropTarget.position !== position) setDropTarget({ id, position });
                },
                onDrop: (e) => {
                  e.preventDefault();
                  if (draggingId && dropTarget && draggingId !== dropTarget.id) {
                    commit(moveId(visibleOrder, draggingId, dropTarget));
                  }
                  resetDrag();
                },
                onDragEnd: resetDrag,
                className: cn(
                  draggingId === id && "opacity-40",
                  showBefore && "shadow-[0_-2px_0_0_var(--color-primary)]",
                  showAfter && "shadow-[0_2px_0_0_var(--color-primary)]",
                ),
              }}
            />
          );
        })}
      </ul>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
