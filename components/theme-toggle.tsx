"use client";

import { useTheme } from "@/lib/theme";
import { MoonIcon, SunIcon } from "@/components/icons";

type Props = {
  className?: string;
};

export function ThemeToggle({ className = "" }: Props) {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "claro" : "oscuro";

  return (
    <button
      onClick={toggle}
      title={`Cambiar a tema ${next}`}
      aria-label={`Cambiar a tema ${next}`}
      className={`inline-flex items-center justify-center p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface transition ${className}`}
    >
      {theme === "dark" ? (
        <MoonIcon width={16} height={16} />
      ) : (
        <SunIcon width={16} height={16} />
      )}
    </button>
  );
}
