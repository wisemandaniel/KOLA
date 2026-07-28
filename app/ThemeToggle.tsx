"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem("kola-theme")) return;
      const next: Theme = event.matches ? "dark" : "light";
      root.dataset.theme = next;
    };
    media.addEventListener("change", followSystem);
    return () => media.removeEventListener("change", followSystem);
  }, []);

  const toggle = () => {
    const next: Theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("kola-theme", next);
  };

  return (
    <button className="theme-toggle" type="button" onClick={toggle} aria-label="Toggle colour theme" title="Toggle colour theme">
      <Sun className="theme-sun" aria-hidden="true" />
      <Moon className="theme-moon" aria-hidden="true" />
      <span>Theme</span>
    </button>
  );
}
