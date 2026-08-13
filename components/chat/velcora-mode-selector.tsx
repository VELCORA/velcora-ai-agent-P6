"use client";

import { motion } from "framer-motion";
import { Briefcase, FileText, Mail, Search, UserCheck } from "lucide-react";
import { useCallback } from "react";
import { type VelcoraMode, velcoraModes } from "@/lib/ai/modes";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Briefcase,
  FileText,
  Mail,
  Search,
  UserCheck,
};

type VelcoraModeCardProps = {
  mode: VelcoraMode;
  isActive: boolean;
  onSelect: (mode: VelcoraMode) => void;
};

function VelcoraModeCard({ mode, isActive, onSelect }: VelcoraModeCardProps) {
  const Icon = iconMap[mode.icon] ?? Briefcase;

  const handleClick = useCallback(() => {
    onSelect(mode);
  }, [mode, onSelect]);

  return (
    <motion.button
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "w-full text-left rounded-xl border px-3 py-2.5 transition-all duration-200 group",
        isActive
          ? "border-violet-500/60 bg-violet-500/10 shadow-[0_0_12px_rgba(139,92,246,0.15)]"
          : "border-sidebar-border bg-sidebar-accent/20 hover:bg-sidebar-accent/50 hover:border-sidebar-border/80"
      )}
      initial={{ opacity: 0, y: 8 }}
      onClick={handleClick}
      type="button"
    >
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br",
            mode.color,
            isActive ? "shadow-sm" : "opacity-70 group-hover:opacity-100"
          )}
        >
          <Icon className="size-3.5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "text-[12px] font-semibold leading-tight truncate",
                isActive
                  ? "text-violet-300"
                  : "text-sidebar-foreground/80 group-hover:text-sidebar-foreground"
              )}
            >
              {mode.name}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] leading-tight text-sidebar-foreground/40 truncate group-hover:text-sidebar-foreground/60 transition-colors">
            {mode.description}
          </p>
        </div>
        {isActive ? (
          <div className="size-1.5 shrink-0 rounded-full bg-violet-400 animate-pulse" />
        ) : null}
      </div>
    </motion.button>
  );
}

type VelcoraModesSelectorProps = {
  activeMode: VelcoraMode;
  onModeChange: (mode: VelcoraMode) => void;
};

export function VelcoraModesSelector({
  activeMode,
  onModeChange,
}: VelcoraModesSelectorProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="px-1 mb-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30">
          Workflow Modes
        </p>
      </div>
      {velcoraModes.map((mode, i) => (
        <motion.div
          animate={{ opacity: 1 }}
          initial={{ opacity: 0 }}
          key={mode.id}
          transition={{ delay: i * 0.05 }}
        >
          <VelcoraModeCard
            isActive={activeMode.id === mode.id}
            mode={mode}
            onSelect={onModeChange}
          />
        </motion.div>
      ))}
    </div>
  );
}
