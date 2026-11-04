import { useState } from "react";
import { Box, ButtonBase, TextField, Typography } from "@mui/material";
import { Edit } from "@mui/icons-material";

// A number you can change in place: click it, type, press Enter (or leave the box) to save, Escape to cancel.
// `onSave(newNumber)` should return a promise and throw if the change is refused.
const InlineNumber = ({ value, display, onSave, label, integer = false, min = 0, max }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");

  const start = () => {
    setDraft(String(value ?? ""));
    setProblem("");
    setEditing(true);
  };

  const finish = async () => {
    if (saving) return;
    const number = Number(draft);
    if (draft.trim() === "" || Number.isNaN(number) || number < min || (max !== undefined && number > max) || (integer && !Number.isInteger(number))) {
      setProblem(integer ? "Whole number" : "Not a valid number");
      return;
    }
    if (number === Number(value)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(number);
      setEditing(false);
    } catch (error) {
      setProblem(error.message || "Not saved");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <TextField
        autoFocus
        size="small"
        type="number"
        value={draft}
        disabled={saving}
        error={Boolean(problem)}
        helperText={problem || " "}
        onChange={(event) => { setDraft(event.target.value); setProblem(""); }}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === "Enter") finish();
          if (event.key === "Escape") setEditing(false);
        }}
        inputProps={{ "aria-label": label, min, max, step: integer ? 1 : "any", style: { textAlign: "right", width: 84 } }}
      />
    );
  }

  return (
    <ButtonBase
      onClick={start}
      aria-label={`${label}: ${display ?? value}. Press to change`}
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 0.75, py: 0.25, borderRadius: "6px", border: 1, borderColor: "transparent", "&:hover": { borderColor: "divider", backgroundColor: "action.hover" } }}
    >
      <Typography component="span" sx={{ fontVariantNumeric: "tabular-nums" }}>{display ?? value}</Typography>
      <Edit sx={{ fontSize: 14, color: "text.secondary" }} />
    </ButtonBase>
  );
};

export default InlineNumber;
