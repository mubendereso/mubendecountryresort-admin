"use client";

import { useState, type InputHTMLAttributes } from "react";

const formatter = new Intl.NumberFormat("en-UG");

function formatUgxInput(value: number): string {
  if (value <= 0) return "";
  return formatter.format(value);
}

function parseUgxInput(value: string): number {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

type UgxAmountInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "value" | "defaultValue" | "onChange"
> & {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
};

export function UgxAmountInput({
  value,
  defaultValue = 0,
  onValueChange,
  ...props
}: UgxAmountInputProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const numericValue = isControlled ? value : internalValue;

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      value={formatUgxInput(numericValue)}
      onChange={(event) => {
        const nextValue = parseUgxInput(event.target.value);
        if (!isControlled) {
          setInternalValue(nextValue);
        }
        onValueChange?.(nextValue);
      }}
    />
  );
}
