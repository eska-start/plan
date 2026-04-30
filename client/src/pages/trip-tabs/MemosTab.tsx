import { trpc } from "@/lib/trpc";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { StickyNote, Loader2, Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import TabShell from "./TabShell";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

type FormData = { title: string; content: string; pinned: boolean };
const defaultForm: FormData = { title: "", content: "", pinned: false };


function normalizeUrl(raw: string) {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function renderLinkText(content: string) {
  const urlRegex = /(https?:\/\/[^\s]+|(?:www\.)[^\s]+)/gi;
  const parts = content.split(urlRegex);
  return parts.map((part, idx) => {
    if (!part) return null;
    if (/^(https?:\/\/|www\.)/i.test(part)) {
      const href = normalizeUrl(part);
      return <a key={idx} href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">{part}</a>;
    }
    return <Fragment key={idx}>{part}</Fragment>;
  });
}

export default function MemosTab({ tripId }: { tripId: number }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteMemoId, setDeleteMemoId] = useState<number | null>(null);
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

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <>
      <TabShell
        title="메모"
        description="여행 관련 메모를 자유롭게 작성하세요."
        onAdd={openCreate}
        addLabel="메모 추가"
        isEmpty={!memos || memos.length === 0}
        emptyIcon={<StickyNote className="w-5 h-5 text-muted-foreground" />}
        emptyTitle="등록된 메모가 없습니다"
        emptyDescription="여행 관련 메모를 자유롭게 작성해보세요."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {memos?.map(m => (
            <div
              key={m.id}
              className={`relative rounded-xl p-4 border transition-shadow hover:shadow-sm ${m.pinned ? "border-primary/30 bg-primary/4" : "card-flat"}`}
            >
              {m.pinned && (
                <div className="absolute top-3 right-3">
                  <Pin className="w-3.5 h-3.5 text-primary" />
                </div>
              )}
              <div className="mb-2 pr-5">
                {m.title && <h3 className="font-semibold text-sm text-foreground mb-0.5">{m.title}</h3>}
                <p className="text-xs text-muted-foreground">
                  {format(new Date(m.updatedAt), "MM.dd HH:mm", { locale: ko })}
                </p>
              </div>
              {m.content && (
                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap mb-3 line-clamp-6">{renderLinkText(m.content)}</p>
              )}
              <div className="flex items-center gap-1 pt-2 border-t border-border">
                <button onClick={() => togglePin(m)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors">
                  {m.pinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                  {m.pinned ? "노트 해제" : "여행노트 표시"}
                </button>
                <button onClick={() => openEdit(m)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors">수정</button>
                <button
                  onClick={() => setDeleteMemoId(m.id)}
                  className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded-md hover:bg-destructive/10 transition-colors ml-auto"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      </TabShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl p-5 sm:p-6">
          <DialogHeader className="mb-1">
            <DialogTitle className="text-lg font-semibold">{editId ? "메모 수정" : "메모 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">제목</Label>
              <Input className="h-10" placeholder="메모 제목 (선택)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">내용</Label>
              <Textarea
                placeholder="메모 내용을 자유롭게 작성하세요..."
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={6}
                className="resize-none"
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))}
                className="w-4 h-4 rounded accent-primary"
              />
              <span className="text-sm font-medium text-foreground">여행노트에 표시</span>
            </label>
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editId ? "수정" : "추가"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteMemoId !== null} onOpenChange={(open) => { if (!open) setDeleteMemoId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>메모 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 메모를 삭제할까요?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteMemoId == null) return;
                deleteMutation.mutate({ id: deleteMemoId });
                setDeleteMemoId(null);
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
