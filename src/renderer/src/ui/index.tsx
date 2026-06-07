/*
 * Hermes UI — the single component library. Codex-style clean/minimal.
 * Screens compose ONLY these primitives + .ui-* classes — no inline styling.
 */
import {
  Children, cloneElement, forwardRef, isValidElement, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode, type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes, type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

/* ── Screen shell (canonical layout → consistent positions everywhere) ── */
export function Screen({
  title, sub, kicker, icon, actions, children, className, maxWidth,
}: {
  title?: ReactNode; sub?: ReactNode; kicker?: ReactNode; icon?: ReactNode; actions?: ReactNode;
  children: ReactNode; className?: string; maxWidth?: number;
}) {
  return (
    <div className="ui-screen">
      <div className={cx("ui-screen-inner", className)} style={maxWidth ? { maxWidth, marginInline: "auto" } : undefined}>
        {(title || actions || kicker) && (
          <header className="ui-screen-head mint-in">
            <div className="flex items-center gap-3 min-w-0">
              {icon && <IconChip>{icon}</IconChip>}
              <div className="ui-screen-titles">
                {kicker && <div className="ui-eyebrow">{kicker}</div>}
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
/** Editorial eyebrow / kicker — the assay-stamp caption (mono · tracked · gold tick). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("ui-eyebrow", className)}>{children}</div>;
}
export const Divider = ({ className }: { className?: string }) => <hr className={cx("ui-divider", className)} />;

/* ── Card ── */
export function Card({
  interactive, active, pad, onClick, className, children, ...rest
}: {
  interactive?: boolean; active?: boolean; pad?: boolean;
  className?: string; children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      onClick={onClick}
      className={cx("ui-card", pad && "ui-card-pad", interactive && "ui-card-hover", active && "ui-card-active", onClick && "cursor-pointer", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ── Buttons ── */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "secondary", size, leftIcon, className, children, type = "button", ...rest
}: { variant?: BtnVariant; size?: "sm"; leftIcon?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cx("ui-btn", `ui-btn-${variant}`, size === "sm" && "ui-btn-sm", className)} {...rest}>
      {leftIcon}{children}
    </button>
  );
}
export function IconButton({
  danger, className, children, type = "button", ...rest
}: { danger?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cx("ui-iconbtn", danger && "ui-iconbtn-danger", className)} {...rest}>{children}</button>;
}

/* ── Inputs ── */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) { return <input ref={ref} className={cx("ui-input", className)} {...rest} />; });
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) { return <textarea ref={ref} className={cx("ui-textarea", className)} {...rest} />; });

type SelectOption = {
  key: string;
  value: string;
  label: ReactNode;
  labelText: string;
  disabled: boolean;
};

type SelectProps = {
  className?: string;
  children: ReactNode;
  value?: string | number;
  defaultValue?: string | number;
  disabled?: boolean;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  onBlur?: ButtonHTMLAttributes<HTMLButtonElement>["onBlur"];
  onFocus?: ButtonHTMLAttributes<HTMLButtonElement>["onFocus"];
  id?: string;
  name?: string;
  title?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

type FloatingRect = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: "top" | "bottom";
};

export function getFloatingRect(anchor: HTMLElement, preferredWidth = anchor.getBoundingClientRect().width, estimatedHeight = 260): FloatingRect {
  const rect = anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const gap = 7;
  const margin = 16;
  const below = Math.max(0, viewportHeight - rect.bottom - margin);
  const above = Math.max(0, rect.top - margin);
  const placement: "top" | "bottom" = below >= 178 || below >= above ? "bottom" : "top";
  const availableHeight = Math.max(96, placement === "bottom" ? below - gap : above - gap);
  const menuHeight = Math.min(Math.max(96, estimatedHeight), availableHeight);
  const width = Math.min(Math.max(preferredWidth, rect.width), Math.max(120, viewportWidth - margin * 2));
  const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - width - margin));
  const top = placement === "bottom"
    ? Math.min(rect.bottom + gap, viewportHeight - margin - menuHeight)
    : Math.max(margin, rect.top - gap - menuHeight);
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    maxHeight: Math.round(menuHeight),
    placement,
  };
}

function textFromNode(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join(" ").trim();
  if (isValidElement<{ children?: ReactNode }>(node)) return textFromNode(node.props.children);
  return "";
}

export function Select({
  className,
  children,
  value,
  defaultValue,
  disabled,
  onChange,
  onBlur,
  onFocus,
  id,
  name,
  title,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: SelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(() => {
    if (defaultValue !== undefined) return String(defaultValue);
    return "";
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuRect, setMenuRect] = useState<FloatingRect | null>(null);

  const options = useMemo<SelectOption[]>(() => (
    Children.toArray(children)
      .filter(isValidElement)
      .map((child, index) => {
        const props = child.props as { value?: string | number; disabled?: boolean; children?: ReactNode };
        const labelText = textFromNode(props.children).trim();
        const optionValue = props.value !== undefined ? String(props.value) : labelText;
        return {
          key: `${optionValue || "option"}-${index}`,
          value: optionValue,
          label: props.children,
          labelText,
          disabled: !!props.disabled,
        };
      })
  ), [children]);

  const selectedValue = value !== undefined ? String(value) : internalValue || options[0]?.value || "";
  const selectedIndex = Math.max(0, options.findIndex(option => option.value === selectedValue));
  const selected = options[selectedIndex] || options[0];

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const estimatedHeight = Math.min(260, options.length * 36 + 12);
    setMenuRect(getFloatingRect(triggerRef.current, undefined, estimatedHeight));
  };

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);
    updatePosition();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const menu = document.getElementById(listId);
      if (rootRef.current?.contains(target) || menu?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [listId, open, selectedIndex]);

  const commitValue = (nextValue: string) => {
    const next = options.find(option => option.value === nextValue);
    if (!next || next.disabled) return;
    if (value === undefined) setInternalValue(next.value);
    onChange?.({
      target: { value: next.value, name },
      currentTarget: { value: next.value, name },
    } as unknown as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const moveActive = (direction: 1 | -1) => {
    if (options.length === 0) return;
    setActiveIndex(current => {
      let next = current;
      for (let step = 0; step < options.length; step += 1) {
        next = (next + direction + options.length) % options.length;
        if (!options[next]?.disabled) return next;
      }
      return current;
    });
  };

  const menuInModal = !!triggerRef.current?.closest(".ui-modal");
  const menu = open && menuRect ? createPortal((
    <div
      id={listId}
      className={cx("ui-select-menu ui-select-menu-portal slide-up", menuInModal && "ui-select-menu-modal")}
      role="listbox"
      aria-label={ariaLabel || title || name || "Select option"}
      data-placement={menuRect.placement}
      style={{ left: menuRect.left, top: menuRect.top, width: menuRect.width, maxHeight: menuRect.maxHeight }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }}
    >
      {options.map((option, index) => {
        const active = option.value === selectedValue;
        const highlighted = index === activeIndex;
        return (
          <button
            key={option.key}
            type="button"
            className={cx("ui-select-option", (active || highlighted) && "is-active")}
            role="option"
            aria-selected={active}
            disabled={option.disabled}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => commitValue(option.value)}
          >
            <span className="ui-select-option-copy"><strong>{option.label}</strong></span>
            {active && <Check size={15} className="ui-select-option-check" />}
          </button>
        );
      })}
    </div>
  ), document.body) : null;

  return (
    <div className={cx("ui-select-popover ui-select-custom", className)} ref={rootRef}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="ui-select-trigger ui-select-trigger-compact"
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        onBlur={onBlur as never}
        onFocus={onFocus as never}
        onClick={() => {
          if (disabled) return;
          setOpen(current => !current);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            moveActive(1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            moveActive(-1);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (open) commitValue(options[activeIndex]?.value || selectedValue);
            else setOpen(true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === "Tab") {
            setOpen(false);
          }
        }}
      >
        <span className="ui-select-trigger-main">{selected?.label || "Select"}</span>
        <ChevronDown size={15} className="ui-select-trigger-chevron" />
      </button>
      {menu}
    </div>
  );
}
function findControlId(node: ReactNode): string | undefined {
  if (isValidElement<{ id?: string }>(node) && typeof node.props.id === "string") return node.props.id;
  if (Array.isArray(node)) {
    for (const child of node) {
      const id = findControlId(child);
      if (id) return id;
    }
  }
  if (isValidElement<{ children?: ReactNode }>(node)) return findControlId(node.props.children);
  return undefined;
}

function shouldReceiveFieldId(node: ReactNode): boolean {
  if (!isValidElement(node)) return false;
  if (node.type === Input || node.type === Textarea || node.type === Select) return true;
  if (typeof node.type !== "string") return false;
  return ["input", "select", "textarea"].includes(node.type);
}

function withControlId(node: ReactNode, id: string): ReactNode {
  if (Array.isArray(node)) {
    let assigned = false;
    return node.map((child) => {
      if (assigned) return child;
      const next = withControlId(child, id);
      if (next !== child) assigned = true;
      return next;
    });
  }
  if (!isValidElement<{ id?: string; children?: ReactNode }>(node)) return node;
  if (!node.props.id && shouldReceiveFieldId(node)) {
    return cloneElement(node, { id });
  }
  if (node.props.children) {
    const nextChildren = withControlId(node.props.children, id);
    if (nextChildren !== node.props.children) {
      return cloneElement(node, { children: nextChildren });
    }
  }
  return node;
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  const fallbackId = useId();
  const foundControlId = findControlId(children);
  const controlId = foundControlId || fallbackId;
  const labelledChildren = foundControlId ? children : withControlId(children, fallbackId);
  return (
    <div className="ui-field">
      <label className="ui-field-label" htmlFor={controlId}>{label}</label>
      {labelledChildren}
      {hint && <span className="ui-field-hint">{hint}</span>}
    </div>
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
export function Modal({ open, onClose, title, kicker, children, footer, width = 560, className }: {
  open: boolean; onClose: () => void; title?: ReactNode; kicker?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number; className?: string;
}) {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => Array.from(
      modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [],
    ).filter(node => !node.hasAttribute("aria-hidden"));
    requestAnimationFrame(() => {
      const preferred = modalRef.current?.querySelector<HTMLElement>(
        '[autofocus], [data-initial-focus="true"], .ui-modal-body input:not([disabled]), .ui-modal-body select:not([disabled]), .ui-modal-body textarea:not([disabled]), .ui-modal-body button:not([disabled])',
      );
      (preferred || focusables()[0] || modalRef.current)?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (document.querySelector(".ui-select-menu-portal, .ui-model-discovery-menu-portal")) return;
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = focusables();
      if (nodes.length === 0) {
        event.preventDefault();
        modalRef.current?.focus();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal((
    <div className="ui-overlay fade-in" onClick={onClose}>
      <div
        ref={modalRef}
        className={cx("ui-modal slide-up", className)}
        style={{ maxWidth: width }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Dialog"}
        tabIndex={-1}
      >
        {title && (
          <div className="ui-modal-head">
            <div className="ui-modal-title-wrap">
              {kicker && <span className="ui-modal-kicker">{kicker}</span>}
              <h2 className="ui-modal-title" id={titleId}>{title}</h2>
            </div>
            <IconButton className="ui-modal-close" onClick={onClose} title="Close dialog" aria-label="Close dialog">
              <X size={16} />
            </IconButton>
          </div>
        )}
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-footer">{footer}</div>}
      </div>
    </div>
  ), document.body);
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
