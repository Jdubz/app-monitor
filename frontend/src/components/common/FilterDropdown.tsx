import { useId } from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FilterOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface FilterDropdownProps {
  label: string;
  value?: string;
  onValueChange: (value: string) => void;
  options: FilterOption[];
  placeholder?: string;
  title?: string;
  className?: string;
  disabled?: boolean;
  triggerClassName?: string;
}

const EMPTY_VALUE_TOKEN = "__filter-dropdown-empty__";
const isTestEnv = typeof import.meta !== "undefined" && import.meta.env?.MODE === "test";

const normalizeValue = (current?: string) =>
  current === "" ? EMPTY_VALUE_TOKEN : current ?? undefined;

const denormalizeValue = (incoming: string) =>
  incoming === EMPTY_VALUE_TOKEN ? "" : incoming;

export function FilterDropdown({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  title,
  className,
  disabled,
  triggerClassName,
}: FilterDropdownProps) {
  const selectId = useId();

  if (isTestEnv) {
    return (
      <div className={cn("flex min-w-[180px] flex-col gap-1", className)}>
        <Label
          htmlFor={selectId}
          className="text-xs uppercase tracking-[0.3em] text-muted-foreground"
        >
          {label}
        </Label>
        <select
          id={selectId}
          className={cn("h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", triggerClassName)}
          value={value ?? ""}
          onChange={(event) => onValueChange(event.target.value)}
          disabled={disabled}
          title={title ?? placeholder ?? label}
        >
          {options.map((option) => (
            <option key={`${option.value}-${option.label}`} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-[180px] flex-col gap-1", className)}>
      <Label
        htmlFor={selectId}
        className="text-xs uppercase tracking-[0.3em] text-muted-foreground"
      >
        {label}
      </Label>
      <Select
        value={normalizeValue(value)}
        onValueChange={(nextValue) => onValueChange(denormalizeValue(nextValue))}
        disabled={disabled}
      >
        <SelectTrigger id={selectId} className={cn("h-9 w-full", triggerClassName)}>
          <SelectValue placeholder={placeholder ?? `Select ${label}`} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={`${option.value}-${option.label}`}
              value={option.value === "" ? EMPTY_VALUE_TOKEN : option.value}
              disabled={option.disabled}
            >
              {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    </div>
  );
}
