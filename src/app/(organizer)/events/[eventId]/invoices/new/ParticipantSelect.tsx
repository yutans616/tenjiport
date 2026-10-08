"use client";

import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/native-select";

export function ParticipantSelect({
  eventId,
  participants,
  selectedId,
}: {
  eventId: string;
  participants: { id: string; name: string }[];
  selectedId: string | null;
}) {
  const router = useRouter();
  return (
    <NativeSelect
      id="participation_select"
      value={selectedId ?? ""}
      onChange={(e) => {
        const id = e.target.value;
        router.push(id ? `/events/${eventId}/invoices/new?participation=${id}` : `/events/${eventId}/invoices/new`);
      }}
    >
      <option value="">選択してください</option>
      {participants.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </NativeSelect>
  );
}
