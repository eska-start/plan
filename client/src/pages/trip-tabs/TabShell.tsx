import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ReactNode } from "react";

interface TabShellProps {
  title: string;
  description?: string;
  onAdd?: () => void;
  addLabel?: string;
  children: ReactNode;
  isEmpty?: boolean;
  emptyIcon?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}

export default function TabShell({
  title,
  description,
  onAdd,
  addLabel = "추가",
  children,
  isEmpty,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: TabShellProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {onAdd && (
          <Button onClick={onAdd} size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />
            {addLabel}
          </Button>
        )}
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 rounded-2xl border border-dashed border-border bg-muted/30">
          {emptyIcon && (
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              {emptyIcon}
            </div>
          )}
          {emptyTitle && (
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
              {emptyDescription && (
                <p className="text-xs text-muted-foreground mt-1">{emptyDescription}</p>
              )}
            </div>
          )}
          {onAdd && (
            <Button onClick={onAdd} size="sm" variant="outline" className="gap-1.5">
              <Plus className="w-4 h-4" />
              {addLabel}
            </Button>
          )}
        </div>
      ) : children}
    </div>
  );
}
