"use client";

type ExerciseThumbProps = {
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
};

export function ExerciseThumb({ name, size = "md" }: ExerciseThumbProps) {
  const palette = getThumbPalette(name);
  const sizeClass =
    size === "lg"
      ? "h-16 w-16 text-lg"
      : size === "xs"
        ? "h-9 w-9 text-xs"
      : size === "sm"
        ? "h-[42px] w-[42px] text-sm"
        : "h-12 w-12 text-base";

  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full font-bold`}
      style={{
        backgroundColor: palette.background,
        color: palette.foreground,
      }}
    >
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </div>
  );
}

function getThumbPalette(name: string) {
  const palettes = [
    { background: "rgba(16, 185, 129, 0.16)", foreground: "#6ee7b7" },
    { background: "rgba(59, 130, 246, 0.16)", foreground: "#93c5fd" },
    { background: "rgba(244, 114, 182, 0.16)", foreground: "#f9a8d4" },
    { background: "rgba(234, 179, 8, 0.16)", foreground: "#fde68a" },
    { background: "rgba(168, 85, 247, 0.16)", foreground: "#d8b4fe" },
  ];
  const index = Array.from(name).reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  );

  return palettes[index % palettes.length];
}
