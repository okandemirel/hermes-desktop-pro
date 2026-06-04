/*
 * Hermes UI — the single component library. Codex-style clean/minimal.
 * Screens compose ONLY these primitives + .ui-* classes — no inline styling.
 */
import {
  forwardRef, type ReactNode, type ButtonHTMLAttributes,
  type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes,
} from "react";
import { Search, X } from "lucide-react";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

/* ── Screen shell (canonical layout → consistent positions everywhere) ── */
export function Screen({
  title, sub, icon, actions, children, className, maxWidth,
}: {
  title?: ReactNode; sub?: ReactNode; icon?: ReactNode; actions?: ReactNode;
  children: ReactNode; className?: string; maxWidth?: number;
}) {
  return (
    <div className="ui-screen">
      <div className={cx("ui-screen-inner", className)} style={maxWidth ? { maxWidth, marginInline: "auto" } : undefined}>
        {(title || actions) && (
          <header className="ui-screen-head">
            <div className="flex items-center gap-3 min-w-0">
              {icon && <IconChip>{icon}</IconChip>}
              <div className="ui-screen-titles">
                {title && <h1 className="ui-screen-title truncate">{title}</h1>}
                {sub && <p className="ui-screen-sub">{sub}</p>}
              </div>
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </header>
        )}
        {children}
      </div>
    </div>
  );
}

export function IconChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("flex items-center justify-center shrink-0 w-9 h-9 rounded-[10px] bg-[var(--accent-weak)] text-[var(--accent-text)] border border-[var(--accent-line)]", className)}>
      {children}
    </span>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("ui-section-label", className)}>{children}</div>;
}
export const Divider = ({ className }: { className?: string }) => <hr className={cx("ui-divider", className)} />;

/* ── Card ── */
export function Card({
  interactive, active, pad, onClick, className, children,
}: {
  interactive?: boolean; active?: boolean; pad?: boolean; onClick?: () => void;
  className?: string; children: ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={cx("ui-card", pad && "ui-card-pad", interactive && "ui-card-hover", active && "ui-card-active", onClick && "cursor-pointer", className)}
    >
      {children}
    </div>
  );
}

/* ── Buttons ── */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "secondary", size, leftIcon, className, children, ...rest
}: { variant?: BtnVariant; size?: "sm"; leftIcon?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cx("ui-btn", `ui-btn-${variant}`, size === "sm" && "ui-btn-sm", className)} {...rest}>
      {leftIcon}{children}
    </button>
  );
}
export function IconButton({
  danger, className, children, ...rest
}: { danger?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cx("ui-iconbtn", danger && "ui-iconbtn-danger", className)} {...rest}>{children}</button>;
}

/* ── Inputs ── */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) { return <input ref={ref} className={cx("ui-input", className)} {...rest} />; });
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) { return <textarea ref={ref} className={cx("ui-textarea", className)} {...rest} />; });
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return <select className={cx("ui-select", className)} {...rest}>{children}</select>;
}
export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-medium text-[var(--text-2)] mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11.5px] text-[var(--text-3)] mt-1.5">{hint}</span>}
    </label>
  );
}
export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cx("ui-search", className)}>
      <Search size={16} className="shrink-0" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

/* ── Badges / tags / status ── */
type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "error";
export function Badge({ variant = "neutral", className, children }: { variant?: BadgeVariant; className?: string; children: ReactNode }) {
  return <span className={cx("ui-badge", `ui-badge-${variant}`, className)}>{children}</span>;
}
export const Tag = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cx("ui-tag", className)}>{children}</span>;
export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="ui-kbd">{children}</kbd>;
export function StatusDot({ color = "var(--text-3)", pulse }: { color?: string; pulse?: boolean }) {
  return <span className={cx("ui-dot", pulse && "pulse")} style={{ background: color }} />;
}

/* ── Toggle ── */
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" className="ui-toggle no-drag" data-on={on} aria-pressed={on} onClick={() => onChange(!on)} />;
}

/* ── Segmented control / tabs ── */
export function Segment({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("ui-segment", className)}>{children}</div>;
}
export function SegmentItem({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return <button type="button" className="ui-segment-item" data-active={!!active} onClick={onClick}>{children}</button>;
}
export function Tab({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return <button type="button" className="ui-tab" data-active={!!active} onClick={onClick}>{children}</button>;
}

/* ── Empty state ── */
export function EmptyState({ icon, title, sub, action }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ui-empty fade-in">
      {icon && <div className="ui-empty-icon">{icon}</div>}
      <h3 className="text-[16px] font-semibold text-[var(--text)]">{title}</h3>
      {sub && <p className="text-[13px] text-[var(--text-2)] mt-1.5 max-w-sm">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ── Modal ── */
export function Modal({ open, onClose, title, children, footer, width = 460 }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  if (!open) return null;
  return (
    <div className="ui-overlay fade-in" onClick={onClose}>
      <div className="ui-modal slide-up" style={{ maxWidth: width }} onClick={e => e.stopPropagation()}>
        {title && (
          <div className="flex items-center justify-between px-5 h-[52px] border-b border-[var(--border)]">
            <h2 className="text-[15px] font-semibold text-[var(--text)]">{title}</h2>
            <IconButton onClick={onClose}><X size={16} /></IconButton>
          </div>
        )}
        <div className="p-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-5 h-[58px] border-t border-[var(--border)]">{footer}</div>}
      </div>
    </div>
  );
}

/* ── Stat / KPI (21st.dev KpiCard pattern: label · value · trend delta · sparkline) ── */
export function Sparkline({ data, tone = "up" }: { data: number[]; tone?: "up" | "down" | "accent" }) {
  const w = 78, h = 30, p = 2;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * (w - p * 2) + p, h - p - ((v - min) / span) * (h - p * 2)]);
  const line = pts.map((pt, i) => `${i ? "L" : "M"}${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(" ");
  const area = `${line} L${(w - p).toFixed(1)} ${h} L${p} ${h} Z`;
  const stroke = tone === "down" ? "var(--error)" : tone === "accent" ? "var(--accent)" : "var(--success)";
  const gid = `spark-${tone}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className="shrink-0" aria-hidden="true">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={stroke} stopOpacity="0.26" /><stop offset="1" stopColor={stroke} stopOpacity="0" />
      </linearGradient></defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Stat({ label, value, delta, caption, spark }: {
  label: ReactNode; value: ReactNode; delta?: number; caption?: ReactNode; spark?: number[];
}) {
  const trend = delta == null ? null : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return (
    <div className="ui-card ui-card-pad">
      <div className="flex items-start justify-between gap-2">
        <span className="ui-section-label">{label}</span>
        {trend && <span className={cx("ui-trend", `ui-trend-${trend}`)}>{trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {Math.abs(delta!)}%</span>}
      </div>
      <div className="flex items-end justify-between gap-2 mt-2.5">
        <div className="serif text-[25px] leading-none text-[var(--text)] truncate">{value}</div>
        {spark && <Sparkline data={spark} tone={trend === "down" ? "down" : "up"} />}
      </div>
      {caption && <div className="text-[11px] text-[var(--text-3)] mt-2 truncate">{caption}</div>}
    </div>
  );
}
