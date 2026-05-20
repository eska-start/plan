import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect, memo } from "react";
import { Plus, Trash2, Loader2, CheckSquare, Sparkles, FileText, Camera, X, Pencil, Check, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import FadeIn from "@/components/FadeIn";

interface Props {
  tripId: number;
  isGuestUser?: boolean;
}

const GROUP_COLORS: Record<string, string> = {
  필수서류: "#DBEEF6",
  "돈·통신": "#DEF1EA",
  "옷·가방": "#FDE2D7",
  기타: "#FBEFCC",
};

const ChecklistItemRow = memo(function ChecklistItemRow({
  item, isSelected, selectMode, editingId,
  onToggle, onSelectToggle, onStartEdit, onDelete,
}: {
  item: { id: number; group: string; label: string; done: boolean };
  isSelected: boolean; selectMode: boolean; editingId: number | null;
  onToggle: (id: number, done: boolean) => void;
  onSelectToggle: (id: number) => void;
  onStartEdit: (id: number, label: string) => void;
  onDelete: (id: number) => void;
}) {
  const [localDone, setLocalDone] = useState<boolean | null>(null);
  const effectiveDone = localDone !== null ? localDone : item.done;
  useEffect(() => { setLocalDone(null); }, [item.done]);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 transition-colors ${selectMode && isSelected ? "bg-destructive/5" : ""}`}
      onClick={selectMode ? () => onSelectToggle(item.id) : undefined}
    >
      {selectMode ? (
        <div className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${isSelected ? "border-destructive bg-destructive" : "border-border"}`}>
          {isSelected && (
            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6l3 3 5-5"/>
            </svg>
          )}
        </div>
      ) : (
        <button
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (editingId === item.id) return;
            const newDone = !effectiveDone;
            setLocalDone(newDone);
            onToggle(item.id, newDone);
          }}
          className="shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors"
          style={{
            borderColor: effectiveDone ? "#7CC8B0" : undefined,
            background: effectiveDone ? "#7CC8B0" : undefined,
          }}
        >
          {effectiveDone && (
            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6l3 3 5-5"/>
            </svg>
          )}
        </button>
      )}

      <span className={`flex-1 text-sm ${effectiveDone && !selectMode ? "line-through text-muted-foreground" : isSelected ? "text-destructive font-medium" : "text-foreground"}`}>
        {item.label}
      </span>

      {!selectMode && editingId !== item.id && (
        <>
          <button onClick={() => onStartEdit(item.id, item.label)} className="text-muted-foreground hover:text-primary shrink-0">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(item.id)} className="text-muted-foreground hover:text-destructive shrink-0" style={{ opacity: 0.4 }}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
});

export default function ChecklistTab({ tripId, isGuestUser = false }: Props) {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.checklist.list.useQuery({ tripId });
  const seed = trpc.checklist.seed.useMutation({ onSuccess: () => utils.checklist.list.invalidate({ tripId }) });
  const create = trpc.checklist.create.useMutation({
    onSuccess: () => {
      utils.checklist.list.invalidate({ tripId });
      toast.success("항목이 추가되었습니다.");
    },
    onError: () => toast.error("항목 추가에 실패했습니다."),
  });
  const toggle = trpc.checklist.toggle.useMutation({ onSuccess: () => utils.checklist.list.invalidate({ tripId }) });
  const update = trpc.checklist.update.useMutation({ onSuccess: () => utils.checklist.list.invalidate({ tripId }) });
  const del = trpc.checklist.delete.useMutation({
    onSuccess: () => {
      utils.checklist.list.invalidate({ tripId });
      toast.success("항목이 삭제되었습니다.");
    },
    onError: () => toast.error("항목 삭제에 실패했습니다."),
  });
  const deleteAll = trpc.checklist.deleteAll.useMutation({
    onSuccess: () => {
      utils.checklist.list.invalidate({ tripId });
      toast.success("전체 항목이 삭제되었습니다.");
    },
    onError: () => toast.error("전체 삭제에 실패했습니다."),
  });

  const [newLabel, setNewLabel] = useState("");
  const [newGroup, setNewGroup] = useState("기타");
  const [newGroupInputVisible, setNewGroupInputVisible] = useState(false);
  const [newGroupInput, setNewGroupInput] = useState("");
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [aiMode, setAiMode] = useState<"text" | "image" | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiItems, setAiItems] = useState<Array<{ group: string; label: string; selected: boolean }>>([]);
  const aiCameraRef = useRef<HTMLInputElement>(null);
  const aiPhotoRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const aiExtractMutation = trpc.checklist.aiExtract.useMutation();
  const aiExtractImageMutation = trpc.checklist.aiExtractFromImage.useMutation();

  async function handleAiText() {
    if (isGuestUser) { toast.info("게스트는 AI 기능을 사용할 수 없어요. 로그인 후 이용해주세요."); return; }
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
    if (isGuestUser) { toast.info("게스트는 AI 기능을 사용할 수 없어요. 로그인 후 이용해주세요."); return; }
    setAiLoading(true);
    try {
      const img = new Image(); const url = URL.createObjectURL(file);
      const b64 = await new Promise<string>((resolve, reject) => {
        img.onload = () => {
          // 텍스트 인식은 800px으로 충분 — Render 30초 제한 내 처리 위해 작게 유지
          const MAX = 800; let { width, height } = img;
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
            else { width = Math.round(width * MAX / height); height = MAX; }
          }
          const c = document.createElement("canvas"); c.width = width; c.height = height;
          c.getContext("2d")!.drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL("image/jpeg", 0.75).split(",")[1]);
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
      const msg: string = e?.message ?? "";
      console.error("[checklist image]", msg);
      toast.error(msg.includes("LLM_API_KEY") ? "LLM_API_KEY가 필요합니다." : `이미지 분석 실패: ${msg.slice(0, 120)}`);
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

  function startEdit(id: number, label: string) {
    setEditingId(id);
    setEditingLabel(label);
  }

  async function commitEdit() {
    if (editingId == null || !editingLabel.trim()) { setEditingId(null); return; }
    await update.mutateAsync({ id: editingId, label: editingLabel.trim() });
    setEditingId(null);
    setEditingLabel("");
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
            {selectMode ? (
              <>
                <Button size="sm" variant="outline" onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }} className="h-7 text-xs px-2">
                  취소
                </Button>
                <Button size="sm" variant="outline"
                  disabled={selectedIds.size === 0}
                  onClick={() => setDeleteSelectedOpen(true)}
                  className="gap-1 h-7 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30 disabled:opacity-40">
                  <Trash2 className="w-3 h-3" />{selectedIds.size > 0 ? `${selectedIds.size}개 삭제` : "삭제"}
                </Button>
              </>
            ) : (
              <>
                {total > 0 && (
                  <Button size="sm" variant="outline" onClick={() => { setSelectMode(true); setSelectedIds(new Set()); }} className="h-7 text-xs px-2">
                    선택 삭제
                  </Button>
                )}
                {total > 0 && (
                  <Button size="sm" variant="outline" onClick={() => setDeleteAllOpen(true)} className="gap-1.5 h-7 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30">
                    전체 지우기
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { if (isGuestUser) { toast.info("게스트는 AI 기능을 사용할 수 없어요. 로그인 후 이용해주세요."); return; } setAiMode(aiMode ? null : "text"); setAiItems([]); }} className="gap-1.5 h-7 text-xs px-2">
                  <Sparkles className="w-3 h-3" />AI
                </Button>
              </>
            )}
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
              {aiItems.map((item, i) => {
                const isNewGroup = !Object.keys(groups).includes(item.group);
                return (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${item.selected ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30"}`}
                    onClick={() => setAiItems(prev => prev.map((x, j) => j === i ? { ...x, selected: !x.selected } : x))}>
                    <input type="checkbox" checked={item.selected} readOnly className="accent-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{item.label}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-xs text-muted-foreground">{item.group}</p>
                        {isNewGroup && (
                          <span className="text-[10px] bg-indigo-100 text-indigo-600 rounded px-1 py-0.5 font-medium leading-none">새 그룹</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
              <button onClick={() => aiPhotoRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-xl py-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <Camera className="w-6 h-6" />
                <span className="text-sm">사진 선택 또는 카메라 촬영</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => aiCameraRef.current?.click()} className="gap-1.5">
                  <Camera className="w-3.5 h-3.5" /> 카메라
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => aiPhotoRef.current?.click()} className="gap-1.5">
                  사진 보관함
                </Button>
              </div>
              <input ref={aiCameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAiImage(f); e.target.value = ""; }} />
              <input ref={aiPhotoRef} type="file" accept="image/*,image/heic,image/heif" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAiImage(f); e.target.value = ""; }} />
            </>
          )}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && total === 0 && !aiMode && (
        <FadeIn>
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground rounded-2xl border border-dashed">
            <ListChecks className="w-8 h-8 opacity-30" />
            <p className="text-sm">준비물 목록이 비어 있어요</p>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 mt-1"
              disabled={seed.isPending}
              onClick={() => seed.mutate({ tripId })}
            >
              {seed.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ListChecks className="w-3.5 h-3.5" />}
              기본 항목으로 시작
            </Button>
          </div>
        </FadeIn>
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
                editingId === item.id ? (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-5 h-5 shrink-0" />
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        autoFocus
                        className="h-7 text-sm py-0"
                        value={editingLabel}
                        onChange={e => setEditingLabel(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingId(null); }}
                      />
                      <button onClick={commitEdit} className="text-primary shrink-0"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} className="text-muted-foreground shrink-0"><X className="w-4 h-4" /></button>
                    </div>
                  </div>
                ) : (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    isSelected={selectedIds.has(item.id)}
                    selectMode={selectMode}
                    editingId={editingId}
                    onToggle={(id, done) => toggle.mutate({ id, done })}
                    onSelectToggle={id => setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
                    onStartEdit={startEdit}
                    onDelete={setDeleteItemId}
                  />
                )
              ))}
            </div>
          </div>
          </FadeIn>
        );
      })}

      {/* Add new item */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">항목 추가</p>

        {/* 그룹 선택 칩 */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">그룹 선택</p>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...Object.keys(groups), "필수서류", "돈·통신", "옷·가방", "기타"])].map(g => (
              <button
                key={g}
                type="button"
                onClick={() => { setNewGroup(g); setNewGroupInputVisible(false); }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  newGroup === g && !newGroupInputVisible
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background border-border hover:border-primary/50 hover:bg-muted/50"
                }`}
              >
                {g}
              </button>
            ))}
            {/* 새 그룹 버튼 */}
            {newGroupInputVisible ? (
              <Input
                autoFocus
                className="h-7 text-xs w-28 rounded-full px-3"
                placeholder="새 그룹명 입력"
                value={newGroupInput}
                onChange={e => setNewGroupInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && newGroupInput.trim()) {
                    setNewGroup(newGroupInput.trim());
                    setNewGroupInputVisible(false);
                    setNewGroupInput("");
                  }
                  if (e.key === "Escape") { setNewGroupInputVisible(false); setNewGroupInput(""); }
                }}
                onBlur={() => {
                  if (newGroupInput.trim()) setNewGroup(newGroupInput.trim());
                  setNewGroupInputVisible(false);
                  setNewGroupInput("");
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => { setNewGroupInputVisible(true); }}
                className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />새 그룹
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            현재 그룹: <span className="font-medium text-foreground">{newGroup}</span>
            {!["필수서류", "돈·통신", "옷·가방", "기타"].includes(newGroup) && !Object.keys(groups).includes(newGroup) && (
              <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-600 rounded px-1 py-0.5 font-medium">새 그룹</span>
            )}
          </p>
        </div>

        {/* 항목 이름 + 등록 */}
        <div className="flex gap-2">
          <Input
            className="flex-1 min-w-0"
            placeholder="항목 이름"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
          />
          <Button size="sm" onClick={handleAdd} disabled={create.isPending || !newLabel.trim()} className="shrink-0 px-4">
            {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "등록"}
          </Button>
        </div>
      </div>


      {/* 선택 삭제 확인 */}
      <AlertDialog open={deleteSelectedOpen} onOpenChange={open => { if (!open) setDeleteSelectedOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>선택 항목 삭제</AlertDialogTitle>
            <AlertDialogDescription>선택한 {selectedIds.size}개 항목을 삭제할까요?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                for (const id of selectedIds) {
                  await del.mutateAsync({ id });
                }
                toast.success(`${selectedIds.size}개 항목이 삭제됐습니다.`);
                setSelectedIds(new Set());
                setSelectMode(false);
                setDeleteSelectedOpen(false);
              }}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>전체 지우기</AlertDialogTitle>
            <AlertDialogDescription>체크리스트 항목 전체({total}개)를 삭제할까요? 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteAll.mutate({ tripId });
                setDeleteAllOpen(false);
              }}
            >
              전체 삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
