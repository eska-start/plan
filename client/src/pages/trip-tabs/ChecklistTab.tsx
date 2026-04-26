import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { Plus, Trash2, Loader2, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  tripId: number;
}

const GROUP_COLORS: Record<string, string> = {
  필수서류: "#DBEEF6",
  "돈·통신": "#DEF1EA",
  "옷·가방": "#FDE2D7",
  기타: "#FBEFCC",
};

export default function ChecklistTab({ tripId }: Props) {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.checklist.list.useQuery({ tripId });
  const seed = trpc.checklist.seed.useMutation({ onSuccess: () => utils.checklist.list.invalidate({ tripId }) });
  const create = trpc.checklist.create.useMutation({ onSuccess: () => utils.checklist.list.invalidate({ tripId }) });
  const toggle = trpc.checklist.toggle.useMutation({ onSuccess: () => utils.checklist.list.invalidate({ tripId }) });
  const del = trpc.checklist.delete.useMutation({ onSuccess: () => utils.checklist.list.invalidate({ tripId }) });

  const [newLabel, setNewLabel] = useState("");
  const [newGroup, setNewGroup] = useState("기타");

  useEffect(() => {
    if (!isLoading && items && items.length === 0) {
      seed.mutate({ tripId });
    }
  }, [isLoading, items]);

  const groups: Record<string, typeof items> = {};
  (items ?? []).forEach(item => {
    const g = item.group ?? "기타";
    if (!groups[g]) groups[g] = [];
    groups[g]!.push(item);
  });

  const total = (items ?? []).length;
  const done = (items ?? []).filter(i => i.done).length;

  async function handleAdd() {
    if (!newLabel.trim()) return;
    await create.mutateAsync({ tripId, group: newGroup, label: newLabel.trim() });
    setNewLabel("");
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">불러오는 중…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header progress */}
      <div className="rounded-2xl border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-[#7CC8B0]" />
            <span className="text-sm font-semibold">준비물 체크리스트</span>
          </div>
          <span className="text-sm font-semibold text-[#7CC8B0]">{done} / {total}</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${total > 0 ? (done / total) * 100 : 0}%`, background: "#7CC8B0" }}
          />
        </div>
        {done === total && total > 0 && (
          <p className="text-xs text-[#5DA88F] font-medium">모든 준비 완료!</p>
        )}
      </div>

      {/* Group sections */}
      {Object.entries(groups).map(([group, groupItems]) => {
        const bg = GROUP_COLORS[group] ?? "#F4F8FB";
        const groupDone = (groupItems ?? []).filter(i => i.done).length;
        const groupTotal = (groupItems ?? []).length;
        return (
          <div key={group} className="rounded-2xl border bg-card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: bg }}>
              <span className="text-xs font-semibold text-foreground tracking-wide">{group}</span>
              <span className="text-xs text-muted-foreground">{groupDone}/{groupTotal}</span>
            </div>
            <div className="divide-y divide-border">
              {(groupItems ?? []).map(item => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => toggle.mutate({ id: item.id, done: !item.done })}
                    className="shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors"
                    style={{
                      borderColor: item.done ? "#7CC8B0" : undefined,
                      background: item.done ? "#7CC8B0" : undefined,
                    }}
                  >
                    {item.done && (
                      <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 6l3 3 5-5"/>
                      </svg>
                    )}
                  </button>
                  <span className={`flex-1 text-sm ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {item.label}
                  </span>
                  <button
                    onClick={() => del.mutate({ id: item.id })}
                    className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ opacity: 0.4 }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Add new item */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">항목 추가</p>
        <div className="flex gap-2">
          <select
            className="rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary w-32 shrink-0"
            value={newGroup}
            onChange={e => setNewGroup(e.target.value)}
          >
            {["필수서류", "돈·통신", "옷·가방", "기타"].map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <Input
            placeholder="항목 이름"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
          />
          <Button size="sm" onClick={handleAdd} disabled={create.isPending || !newLabel.trim()} className="gap-1 shrink-0">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
