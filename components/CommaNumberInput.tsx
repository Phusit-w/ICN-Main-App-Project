"use client";

import { useState } from "react";
import Field, { type FieldProps } from "@/components/ui/Field";

// Money inputs that show thousands separators while typing ("147,349,700")
// but hand the rest of the app a plain numeric string ("147349700"). An
// <input type="number"> can't display commas, so these are type="text" with
// the raw value kept separately — in a hidden <input name> for plain GET/POST
// forms, or via onValueChange for client-side forms.

// Keeps digits and the first ".", capped at maxDecimals decimal places.
export function toRawNumber(text: string, maxDecimals = 2): string {
  const cleaned = text.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  const intPart = cleaned.slice(0, dot);
  const decPart = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, maxDecimals);
  return maxDecimals > 0 ? `${intPart}.${decPart}` : intPart;
}

// String-based (not Number()) so large values never lose precision, and a
// trailing "." stays visible while the user is mid-typing "1.5".
export function withCommas(raw: string): string {
  if (!raw) return "";
  const [intPart, decPart] = raw.split(".");
  const trimmed = intPart.replace(/^0+(?=\d)/, "");
  const grouped = trimmed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart === undefined ? grouped : `${grouped || "0"}.${decPart}`;
}

type CommaProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (raw: string) => void;
  maxDecimals?: number;
};

function useRawValue({ value, defaultValue, onValueChange, maxDecimals = 2 }: CommaProps) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const raw = value ?? inner;
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = toRawNumber(e.target.value, maxDecimals);
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };
  return { raw, onChange };
}

type InputProps = CommaProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "type">;

export default function CommaNumberInput({ value, defaultValue, onValueChange, maxDecimals, name, ...rest }: InputProps) {
  const { raw, onChange } = useRawValue({ value, defaultValue, onValueChange, maxDecimals });
  return (
    <>
      <input {...rest} type="text" inputMode="decimal" value={withCommas(raw)} onChange={onChange} />
      {name ? <input type="hidden" name={name} value={raw} /> : null}
    </>
  );
}

type FieldVariantProps = CommaProps &
  Omit<FieldProps, "value" | "defaultValue" | "onChange" | "type" | "rightSlot">;

export function CommaNumberField({ value, defaultValue, onValueChange, maxDecimals, name, ...rest }: FieldVariantProps) {
  const { raw, onChange } = useRawValue({ value, defaultValue, onValueChange, maxDecimals });
  return (
    <Field
      {...rest}
      type="text"
      inputMode="decimal"
      value={withCommas(raw)}
      onChange={onChange}
      rightSlot={name ? <input type="hidden" name={name} value={raw} /> : undefined}
    />
  );
}
