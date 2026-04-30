type SetType = "normal" | "warmup" | "failure" | "drop";

type SetLabelSource = {
  set_type?: SetType;
  setType?: SetType;
  set_number?: number | null;
  setNumber?: number | null;
  row_index?: number;
  rowIndex?: number;
};

export function formatSetLabel(set: SetLabelSource) {
  const setType = set.set_type ?? set.setType;

  if (setType === "warmup") {
    return "W";
  }

  if (setType === "failure") {
    return "F";
  }

  if (setType === "drop") {
    return "D";
  }

  return (
    set.set_number?.toString() ??
    set.setNumber?.toString() ??
    set.row_index?.toString() ??
    set.rowIndex?.toString() ??
    ""
  );
}

export function getSetLabelClassName(setType: SetType) {
  if (setType === "warmup") {
    return "text-amber-300";
  }

  if (setType === "failure") {
    return "text-red-400";
  }

  if (setType === "drop") {
    return "text-sky-400";
  }

  return "text-white";
}
