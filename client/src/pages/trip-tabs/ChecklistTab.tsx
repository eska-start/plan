import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Loader2, CheckSquare, Sparkles, FileText, Camera, X, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import FadeIn from "@/components/FadeIn";

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
  const update = trpc.checklist.update.useMutation({ onSuccess: () => utils.checklist.list.invalidate({ tripId }) });
  const del = trpc.checklist.delete.useMutation({
    onSuccess: () => {
      utils.checklist.list.invalidate({ tripId });
      toast.success("항목이 삭제되었습니다.");
    },
    onError: () => toast.error("항목 삭제에 실패했습니다."),
  });

  const [newLabel, setNewLabel] = useState("");
  const [newGroup, setNewGroup] = useState("기타");
  const [newImageUrl, setNewImageUrl] = useState<string | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [aiMode, setAiMode] = useState<"text" | "image" | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiItems, setAiItems] = useState<Array<{ group: string; label: string; selected: boolean }>>([]);
  const aiFileRef = useRef<HTMLInputElement>(null);
  const itemImageRef = useRef<HTMLInputElement>(null);
  const [imageTargetId, setImageTargetId] = useState<number | null>(null);

  const aiExtractMutation = trpc.checklist.aiExtract.useMutation();
  const aiExtractImageMutation = trpc.checklist.aiExtractFromImage.useMutation();

  async function handleAiText() {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const res = await aiExtractMutation.mutateAsync({ tripId, text: aiText });
      const extracted = (res.items as Array<Record<string, unknown>>).map(i => ({
        group: (i.group as string) ?? "기타",
        label: (i.label as string) ?? "",
        selected: true,
      })).filter(i => i.label);
      if (!extracted.length) { toast.error("항목을 찾지 못했습니다."); return; }
      setAiItems(extracted);
    } catch (e: any) {
      toast.error(e?.message?.includes("LLM_API_KEY") ? "LLM_API_KEY가 필요합니다." : "AI 분석 실패");
    } finally { setAiLoading(false); }
  }

  async function handleAiImage(file: File) {
    setAiLoading(true);
    try {
      const img = new Image(); const url = URL.createObjectURL(file);
      const b64 = await new Promise<string>((resolve, reject) => {
        img.onload = () => {
          const MAX = 1400; let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
            else { width = Math.round(width * MAX / height); height = MAX; }
          }
          const c = document.createElement("canvas"); c.width = width; c.height = height;
          c.getContext("2d")!.drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
        };
        img.onerror = reject; img.src = url;
      });
      const res = await aiExtractImageMutation.mutateAsync({ tripId, imageBase64: b64 });
      const extracted = (res.items as Array<Record<string, unknown>>).map(i => ({
        group: (i.group as string) ?? "기타",
        label: (i.label as string) ?? "",
        selected: true,
      })).filter(i => i.label);
      if (!extracted.length) { toast.error("항목을 찾지 못했습니다."); return; }
      setAiItems(extracted);
    } catch (e: any) {
      toast.error(e?.message?.includes("LLM_API_KEY") ? "LLM_API_KEY가 필요합니다." : "이미지 분석 실패");
    } finally { setAiLoading(false); }
  }

  async function handleAiSave() {
    const toSave = aiItems.filter(i => i.selected && i.label);
    for (const item of toSave) {
      await create.mutateAsync({ tripId, group: item.group, label: item.label });
    }
    toast.success(`${toSave.length}개 항목이 추가됐습니다.`);
    setAiItems([]); setAiMode(null); setAiText("");
  }

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

  async function toDataUrl(file: File) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleAdd() {
    if (!newLabel.trim()) return;
    await create.mutateAsync({ tripId, group: newGroup, label: newLabel.trim(), imageUrl: newImageUrl });
    setNewLabel("");
    setNewImageUrl(null);
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
      <FadeIn>
      <div className="rounded-2xl border bg-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-[#7CC8B0]" />
            <span className="text-sm font-semibold">준비물 체크리스트</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#7CC8B0]">{done} / {total}</span>
            <Button size="sm" variant="outline" onClick={() => { setAiMode(aiMode ? null : "text"); setAiItems([]); }} className="gap-1.5 h-7 text-xs px-2">
              <Sparkles className="w-3 h-3" />AI
            </Button>
          </div>
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
      </FadeIn>

      {/* AI 입력 패널 */}
      {aiMode && (
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button onClick={() => setAiMode("text")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${aiMode === "text" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
                <FileText className="w-3.5 h-3.5" />텍스트
              </button>
              <button onClick={() => setAiMode("image")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${aiMode === "image" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"}`}>
                <Camera className="w-3.5 h-3.5" />이미지
              </button>
            </div>
            <button onClick={() => { setAiMode(null); setAiItems([]); setAiText(""); }}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>

          {aiLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> AI 분석 중…
            </div>
          ) : aiItems.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">추가할 항목을 선택하세요.</p>
              {aiItems.map((item, i) => (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${item.selected ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"}`}
                  onClick={() => setAiItems(prev => prev.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}>
                  <input type="checkbox" checked={item.selected} readOnly className="accent-primary" />
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.group}</p>
                  </div>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setAiItems([])} className="flex-1">다시 입력</Button>
                <Button size="sm" onClick={handleAiSave} disabled={!aiItems.some(i => i.selected)} className="flex-1">저장</Button>
              </div>
            </div>
          ) : aiMode === "text" ? (
            <>
              <textarea className="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="준비물을 입력하세요. 예: '여권, 엔화 환전 5만엔, 방한 자켓, 포켓 와이파이'"
                value={aiText} onChange={e => setAiText(e.target.value)} />
              <Button size="sm" onClick={handleAiText} disabled={!aiText.trim()} className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />분석하기
              </Button>
            </>
          ) : (
            <>
              <button onClick={() => aiFileRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-xl py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <Camera className="w-6 h-6" />
                <span className="text-sm">사진 선택 또는 카메라 촬영</span>
              </button>
              <input ref={aiFileRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAiImage(f); e.target.value = ""; }} />
            </>
          )}
        </div>
      )}

      {/* Group sections */}
      {Object.entries(groups).map(([group, groupItems], gi) => {
        const bg = GROUP_COLORS[group] ?? "#F4F8FB";
        const groupDone = (groupItems ?? []).filter(i => i.done).length;
        const groupTotal = (groupItems ?? []).length;
        return (
          <FadeIn key={group} delay={0.05 + gi * 0.07}>
          <div className="rounded-2xl border bg-card overflow-hidden">
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
                    {item.imageUrl && (
                      <a href={item.imageUrl} target="_blank" rel="noreferrer" className="block mt-1">
                        <img src={item.imageUrl} alt={item.label} className="w-20 h-20 rounded-md object-cover border" />
                      </a>
                    )}
                  </span>
                  <button onClick={() => { setImageTargetId(item.id); itemImageRef.current?.click(); }} className="text-muted-foreground hover:text-primary shrink-0">
                    <ImagePlus className="w-4 h-4" />
                  </button>
                  {item.imageUrl && (
                    <button onClick={() => update.mutate({ id: item.id, imageUrl: null })} className="text-muted-foreground hover:text-destructive shrink-0" title="이미지 제거">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteItemId(item.id)}
                    className="text-muted-foreground hover:text-destructive shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ opacity: 0.4 }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          </FadeIn>
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
          <button type="button" onClick={() => { setImageTargetId(null); itemImageRef.current?.click(); }} className="rounded-md border px-2 text-xs text-muted-foreground hover:text-primary">이미지</button>
          <Button size="sm" onClick={handleAdd} disabled={create.isPending || !newLabel.trim()} className="gap-1 shrink-0">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        {newImageUrl && (
          <div className="pt-1">
            <img src={newImageUrl} alt="새 항목 이미지" className="w-20 h-20 rounded-md object-cover border" />
          </div>
        )}
      </div>

      <input ref={itemImageRef} type="file" accept="image/*" className="hidden" onChange={async e => {
        const f = e.target.files?.[0];
        if (!f) return;
        const dataUrl = await toDataUrl(f);
        if (imageTargetId != null) {
          await update.mutateAsync({ id: imageTargetId, imageUrl: dataUrl });
          setImageTargetId(null);
        } else {
          setNewImageUrl(dataUrl);
        }
        e.target.value = "";
      }} />

      <AlertDialog open={deleteItemId !== null} onOpenChange={(open) => { if (!open) setDeleteItemId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>체크리스트 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 준비물 항목을 삭제할까요?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteItemId == null) return;
                del.mutate({ id: deleteItemId });
                setDeleteItemId(null);
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
