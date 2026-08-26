import { BriefcaseBusiness } from "lucide-react";

// Compact product mark used by the desktop shell, mobile header and assistant.
export function CoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-brand-soft text-brand shadow-[inset_0_0_18px_rgba(69,200,255,0.12)]"
      style={{
        width: size,
        height: size,
      }}
    >
      <BriefcaseBusiness style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5) }} />
    </span>
  );
}
