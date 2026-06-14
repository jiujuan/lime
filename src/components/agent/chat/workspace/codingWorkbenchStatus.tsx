import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  TerminalSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  statusTone,
  toneClassName,
  type CodingStatusTone,
} from "./codingWorkbenchStatusModel";

function statusIcon(tone: CodingStatusTone) {
  if (tone === "running") return <Clock3 className="h-3.5 w-3.5" />;
  if (tone === "failed") return <CircleAlert className="h-3.5 w-3.5" />;
  if (tone === "completed") return <CheckCircle2 className="h-3.5 w-3.5" />;
  return <TerminalSquare className="h-3.5 w-3.5" />;
}

export function CodingStatusBadge({
  status,
  label,
}: {
  status?: string | null;
  label: string;
}) {
  const tone = statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        toneClassName(tone),
      )}
    >
      {statusIcon(tone)}
      {label}
    </span>
  );
}
