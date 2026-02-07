import { cn } from "@/lib/utils";

interface MatchPillProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function MatchPill({ score, size = "md", showLabel = true, className }: MatchPillProps) {
  const color = score >= 75 ? "green" : score >= 50 ? "yellow" : "grey";

  const colorClasses = {
    green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    yellow: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    grey: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  };

  const glowClasses = {
    green: "shadow-[0_0_12px_rgba(16,185,129,0.2)]",
    yellow: "shadow-[0_0_12px_rgba(245,158,11,0.2)]",
    grey: "",
  };

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-semibold tabular-nums",
        colorClasses[color],
        glowClasses[color],
        sizeClasses[size],
        className
      )}
      data-testid={`match-pill-${score}`}
    >
      <span className={cn(
        "inline-block rounded-full",
        size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2",
        color === "green" && "bg-emerald-400",
        color === "yellow" && "bg-amber-400",
        color === "grey" && "bg-zinc-400",
      )} />
      {score}%{showLabel && <span className="opacity-70 font-normal ml-0.5">match</span>}
    </span>
  );
}

export function MatchGlow({ score, children, className }: { score: number; children: React.ReactNode; className?: string }) {
  const color = score >= 75 ? "green" : score >= 50 ? "yellow" : "grey";

  const glowClasses = {
    green: "ring-1 ring-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.08)]",
    yellow: "ring-1 ring-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.08)]",
    grey: "ring-1 ring-zinc-500/15",
  };

  return (
    <div className={cn(glowClasses[color], "rounded-md", className)}>
      {children}
    </div>
  );
}
