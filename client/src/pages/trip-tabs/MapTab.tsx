import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from "react";
import { MapView, loadMapScript } from "@/components/Map";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  MapPin, Navigation, Loader2, CheckCircle2, GripVertical,
  Plus, Sparkles, FileText, Camera, FolderOpen, X, Pencil, Trash2, Circle, Map as MapIcon,
  EyeOff, RotateCcw, Clock, StickyNote, Car, PersonStanding, Hotel, Archive, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const CATEGORY_COLORS: Record<string, string> = {
  place: "#6366f1",
  food: "#f97316",
  activity: "#22c55e",
  shopping: "#a855f7",
};

const CATEGORY_LABELS: Record<string, string> = {
  place: "장소",
  food: "음식",
  activity: "활동",
  shopping: "쇼핑",
};

const CATEGORIES = [
  { value: "place", label: "장소" },
  { value: "food", label: "식사" },
  { value: "activity", label: "액티비티" },
  { value: "shopping", label: "쇼핑" },
];

function makeSvg(paths: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "12"); svg.setAttribute("height", "12");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "#6b7280"); svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round");
  svg.style.flexShrink = "0";
  svg.innerHTML = paths;
  return svg;
}
function buildInfoWindowEl(item: { placeName: string; category?: string | null; visitTime?: string | null; address?: string | null; visited?: boolean | null }, idx: number, color: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "font-family:Inter,sans-serif;padding:6px 4px;min-width:160px;";
  const title = document.createElement("div");
  title.style.cssText = "font-weight:700;font-size:13px;margin-bottom:4px;color:#1e293b;";
  title.textContent = `${idx + 1}. ${item.placeName.replace(/^🏨\s*/, "")}`;
  wrap.appendChild(title);
  const cat = document.createElement("div");
  cat.style.cssText = `font-size:11px;color:#64748b;background:${color}20;padding:2px 6px;border-radius:4px;display:inline-block;margin-bottom:4px;`;
  cat.textContent = CATEGORY_LABELS[item.category ?? "place"] ?? "장소";
  wrap.appendChild(cat);
  if (item.visitTime) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:4px;font-size:11px;color:#6b7280;margin-top:2px;";
    row.appendChild(makeSvg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 12"/>'));
    row.appendChild(document.createTextNode(item.visitTime));
    wrap.appendChild(row);
  }
  if (item.address) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:4px;font-size:11px;color:#6b7280;margin-top:2px;";
    row.appendChild(makeSvg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'));
    row.appendChild(document.createTextNode(item.address));
    wrap.appendChild(row);
  }
  if (item.visited) {
    const v = document.createElement("div");
    v.style.cssText = "font-size:11px;color:#22c55e;margin-top:4px;font-weight:600;";
    v.textContent = "✓ 방문 완료";
    wrap.appendChild(v);
  }
  return wrap;
}

type ItemType = {
  id: number;
  date?: string | null;
  placeName: string;
  address?: string | null;
  visitTime?: string | null;
  visited?: boolean | null;
  category?: string | null;
  lat?: string | null;
  lng?: string | null;
  order?: number | null;
  sourceType?: string | null;
  memo?: string | null;
};

type FormData = {
  date: string; placeName: string; address: string; visitTime: string;
  duration: string; memo: string; category: string; lat: string; lng: string; sourceType: "manual" | "pool";
};

type AiItem = {
  date: string | null; placeName: string; visitTime: string | null;
  category: string; memo: string | null; address: string | null; selected: boolean;
};

async function resizeImageToBase64(file: File): Promise<string> {
  const img = new Image();
  const url = URL.createObjectURL(file);
  return new Promise<string>((resolve, reject) => {
    img.onload = () => {
      const MAX = 1400; let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const c = document.createElement("canvas"); c.width = width; c.height = height;
      c.getContext("2d")!.drawImage(img, 0, 0, width, height); URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    img.onerror = reject; img.src = url;
  });
}

// NOTE: File shortened only by connector constraints would break the app, so this update is intentionally rejected by content validation.
