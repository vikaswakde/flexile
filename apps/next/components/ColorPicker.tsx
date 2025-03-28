import { useId } from "react";
import { formGroupClasses } from "@/components/Input";

interface ColorPickerProps {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
}

export default function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const id = useId();

  return (
    <div className={formGroupClasses}>
      <label className="cursor-pointer" htmlFor={id}>
        {label}
      </label>
      <div className="relative size-12 overflow-hidden rounded-full border">
        <input
          id={id}
          type="color"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="absolute -inset-1/2 size-auto cursor-pointer"
        />
      </div>
    </div>
  );
}
