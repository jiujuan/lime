import React from "react";
import { X } from "lucide-react";
import {
  ModeStatusChip as StyledModeStatusChip,
  ModeStatusLabel,
  ModeStatusRemoveMark,
} from "../styles";

interface InputbarModeStatusChipProps {
  label: string;
  testId: string;
  onRemove: () => void;
}

export function InputbarModeStatusChip({
  label,
  testId,
  onRemove,
}: InputbarModeStatusChipProps) {
  return (
    <StyledModeStatusChip
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onRemove}
    >
      <ModeStatusRemoveMark aria-hidden data-testid={`${testId}-remove-mark`}>
        <X />
      </ModeStatusRemoveMark>
      <ModeStatusLabel>{label}</ModeStatusLabel>
    </StyledModeStatusChip>
  );
}
