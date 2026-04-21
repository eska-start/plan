import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { StickyNote, Loader2, Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import TabShell from "./TabShell";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

type FormData = { title: string; content: string; pinned: boolean };
const defaultForm: FormData = { title: "", content: "", pinned: false };

export default function MemosTab({ tripId }: { tripId: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);
  const utils = trpc.useUtils();

  const { data: memos, isLoading } = trpc.memos.list.useQuery({ tripId });

  const createMutation = trpc.memos.create.useMutation({
    onSuccess: () => { utils.memos.list.invalidate(); setDialogOpen(false); setForm(defaultForm); toast.success("메모가 추가되었습니다."); },
    onError: () => toast.error("메모 추가에 실패했습니다."),
  });

  const updateMutation = trpc.memos.update.useMutation({
    onSuccess: () => { utils.memos.list.invalidate(); setDialogOpen(false); setEditId(null); setForm(defaultForm); toast.success("메모가 수정되었습니다."); },
    onError: () => toast.error("메모 수정에 실패했습니다."),
  });

  const deleteMutation = trpc.memos.delete.useMutation({
    onSuccess: () => { utils.memos.list.invalidate(); toast.success("메모가 삭제되었습니다."); },
    onError: () => toast.error("메모 삭제에 실패했습니다."),
  });

  const togglePin = (m: NonNullable<typeof memos>[number]) => {
    updateMutation.mutate({ id: m.id, pinned: !m.pinned });
  };

  const openCreate = () => { setEditId(null); setForm(defaultForm); setDialogOpen(true); };
  const openEdit = (m: NonNullable<typeof memos>[number]) => {
    setEditId(m.id);
    setForm({ title: m.title ?? "", content: m.content ?? "", pinned: m.pinned ?? false });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (editId) updateMutation.mutate({ id: editId, ...form });
    else createMutation.mutate({ tripId, ...form });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <>
      <TabShell
        title="메모"
        description="여행 관련 메모를 자유롭게 작성하세요."
        onAdd={openCreate}
        addLabel="메모 추가"
        isEmpty={!memos || memos.length === 0}
        emptyIcon={<StickyNote className="w-6 h-6 text-muted-foreground" />}
        emptyTitle="등록된 메모가 없습니다"
        emptyDescription="여행 관련 메모를 자유롭게 작성해보세요."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {memos?.map(m => (
            <div
              key={m.id}
              className={`bg-card border rounded-xl p-4 hover:shadow-sm transition-shadow relative ${m.pinned ? "border-accent/40 bg-accent/5" : "border-border"}`}
            >
              {m.pinned && (
                <div className="absolute top-3 right-3">
                  <Pin className="w-3.5 h-3.5 text-accent" />
                </div>
              )}
              <div className="flex items-start justify-between mb-2 pr-5">
                <div>
                  {m.title && <h3 className="font-semibold text-sm text-foreground mb-1">{m.title}</h3>}
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(m.updatedAt), "MM.dd HH:mm", { locale: ko })}
                  </p>
                </div>
              </div>
              {m.content && (
                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap mb-3 line-clamp-6">{m.content}</p>
              )}
              <div className="flex items-center gap-1 pt-2 border-t border-border">
                <button
                  onClick={() => togglePin(m)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                >
                  {m.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                  {m.pinned ? "고정 해제" : "고정"}
                </button>
                <button onClick={() => openEdit(m)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">수정</button>
                <button onClick={() => deleteMutation.mutate({ id: m.id })} className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded hover:bg-destructive/10 transition-colors ml-auto">삭제</button>
              </div>
            </div>
          ))}
        </div>
      </TabShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{editId ? "메모 수정" : "메모 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>제목</Label>
              <Input placeholder="메모 제목 (선택)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>내용</Label>
              <Textarea
                placeholder="메모 내용을 자유롭게 작성하세요..."
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={6}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pinned"
                checked={form.pinned}
                onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))}
                className="w-4 h-4 rounded"
              />
              <Label htmlFor="pinned" className="cursor-pointer">상단 고정</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editId ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
