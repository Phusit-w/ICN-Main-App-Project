import type { ButtonHTMLAttributes, Ref } from "react";

// Shared button for the 2026 redesign. Carries the `ui-btn` class, which
// globals.css's site-wide `button:hover → solid black` scaffolding rule
// explicitly excludes, so each variant keeps its own hover treatment.
// Legacy screens keep their inline-styled <button>s until they're converted.

type Variant =
  | "primary"
  | "dark"
  | "outline"
  | "ghost"
  | "danger"
  | "dangerSolid";
type Size = "md" | "sm";

const base =
  "ui-btn inline-flex items-center justify-center gap-2 rounded-input font-medium " +
  "transition-colors disabled:opacity-60 disabled:pointer-events-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const sizes: Record<Size, string> = {
  md: "h-[46px] px-5 text-sm",
  sm: "h-9 px-3.5 text-[13px]",
};

const variants: Record<Variant, string> = {
  // Poppins, orange — the mockup's primary CTA
  // text-black, not text-ink: bg-accent stays orange in dark mode, so the
  // label must stay dark rather than flip to the light ink token.
  primary:
    "bg-accent text-black font-display font-bold hover:bg-[#f08d10] active:bg-[#e08207]",
  // text-ground (not text-white): under the dark theme `bg-ink` flips to a
  // near-white fill, so the label must flip with it. opacity hover works in
  // both themes without another inversion step.
  dark: "bg-ink text-ground hover:opacity-90 active:opacity-80",
  outline:
    "border border-line bg-surface text-label hover:bg-hover hover:text-ink active:bg-line",
  ghost: "bg-transparent text-label hover:bg-hover hover:text-ink active:bg-line",
  // Outline red — the "ลบ" / "ล้างข้อมูล" pills. Fills solid red on hover,
  // one shade darker while held (matches dangerSolid's active).
  danger:
    "border border-danger-border bg-surface text-danger hover:bg-danger hover:text-white active:bg-[#8f1e17] active:text-white",
  // Solid red — a confirm-delete primary action.
  dangerSolid: "bg-danger text-white hover:bg-[#8f1e17] active:bg-[#7a1a14]",
};

// The same look on an <a> (e.g. a download link).
export function buttonClassName({ variant = "primary", size = "md" }: { variant?: Variant; size?: Size } = {}) {
  return `${base} ${sizes[size]} ${variants[variant]}`;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  variant?: Variant;
  size?: Size;
}

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${buttonClassName({ variant, size })} ${className}`}
      {...rest}
    />
  );
}
