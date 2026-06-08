export type ThemePreference = "dark" | "light" | "system";

export interface AppearancePreferences {
  theme: ThemePreference;
  accent: string;
}

export const DEFAULT_ACCENT = "#E7B84E";
export const ACCENT_OPTIONS = ["#E7B84E", "#FF453A", "#30D158", "#0A84FF", "#BF5AF2", "#FF9F0A"];

const THEME_KEY = "hermes:appearance:theme";
const ACCENT_KEY = "hermes:appearance:accent";

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeHex(value: string | null | undefined): string {
  const raw = (value || "").trim();
  if (!HEX_RE.test(raw)) return DEFAULT_ACCENT;
  if (raw.length === 4) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toUpperCase();
  }
  return raw.toUpperCase();
}

function normalizeTheme(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "system" || value === "dark" ? value : "dark";
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex).slice(1);
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function mix(hex: string, target: [number, number, number], weight: number): string {
  const rgb = hexToRgb(hex);
  return rgbToHex([
    rgb[0] + (target[0] - rgb[0]) * weight,
    rgb[1] + (target[1] - rgb[1]) * weight,
    rgb[2] + (target[2] - rgb[2]) * weight,
  ]);
}

function relativeLuminance(hex: string): number {
  const srgb = hexToRgb(hex).map((v) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function readAppearancePreferences(): AppearancePreferences {
  const local = storage();
  return {
    theme: normalizeTheme(local?.getItem(THEME_KEY)),
    accent: normalizeHex(local?.getItem(ACCENT_KEY)),
  };
}

export function writeAppearancePreferences(preferences: AppearancePreferences): AppearancePreferences {
  const normalized = {
    theme: normalizeTheme(preferences.theme),
    accent: normalizeHex(preferences.accent),
  };
  const local = storage();
  local?.setItem(THEME_KEY, normalized.theme);
  local?.setItem(ACCENT_KEY, normalized.accent);
  return normalized;
}

export function resolveThemePreference(theme: ThemePreference): "dark" | "light" {
  if (theme !== "system") return theme;
  const media = window.matchMedia?.("(prefers-color-scheme: light)");
  return media?.matches ? "light" : "dark";
}

export function applyAppearancePreferences(preferences = readAppearancePreferences()): AppearancePreferences {
  const normalized = writeAppearancePreferences(preferences);
  const resolvedTheme = resolveThemePreference(normalized.theme);
  const root = document.documentElement;
  const [r, g, b] = hexToRgb(normalized.accent);
  const isLight = resolvedTheme === "light";
  const textAccent = isLight ? mix(normalized.accent, [0, 0, 0], 0.22) : mix(normalized.accent, [255, 255, 255], 0.20);
  const hover = mix(normalized.accent, [255, 255, 255], isLight ? 0.16 : 0.28);
  const shade = mix(normalized.accent, [0, 0, 0], isLight ? 0.16 : 0.25);
  const contrastInk = relativeLuminance(normalized.accent) > 0.5 ? "#241B06" : "#FFFFFF";

  root.dataset.themePref = normalized.theme;
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
  root.style.setProperty("--accent", normalized.accent);
  root.style.setProperty("--accent-rgb", `${r}, ${g}, ${b}`);
  root.style.setProperty("--accent-hover", hover);
  root.style.setProperty("--accent-text", textAccent);
  root.style.setProperty("--accent-weak", `rgba(${r}, ${g}, ${b}, ${isLight ? 0.12 : 0.14})`);
  root.style.setProperty("--accent-line", `rgba(${r}, ${g}, ${b}, ${isLight ? 0.34 : 0.40})`);
  root.style.setProperty("--gold-ink", contrastInk);
  root.style.setProperty(
    "--gold-grad",
    `linear-gradient(135deg, ${mix(normalized.accent, [255, 255, 255], 0.72)} 0%, ${hover} 24%, ${normalized.accent} 52%, ${shade} 100%)`,
  );
  root.style.setProperty("--gold-sheen", "linear-gradient(112deg, transparent 30%, rgba(255,255,255,0.62) 49%, rgba(255,255,255,0.18) 55%, transparent 70%)");

  return normalized;
}

export function subscribeToSystemTheme(callback: () => void): () => void {
  const media = window.matchMedia?.("(prefers-color-scheme: light)");
  if (!media) return () => {};
  media.addEventListener?.("change", callback);
  return () => media.removeEventListener?.("change", callback);
}
