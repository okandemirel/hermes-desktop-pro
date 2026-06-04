/*
 * BrandMark — Hermes identity in metallic gold (the messenger's signature).
 * A winged caduceus monogram (messenger's staff + wings) struck in brushed gold,
 * paired with the "HERMES" serif wordmark. Ownable warm-gold mark against the
 * cool obsidian glass. Reused at three scales: sidebar mark, chat hero, medallion.
 */

interface GlyphProps {
  size?: number;
  className?: string;
}

/** The raw winged-caduceus glyph, in brushed gold. */
export function HermesGlyph({ size = 28, className = "" }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="hermesGold" x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FCEFC2" />
          <stop offset="0.32" stopColor="#F1CC6E" />
          <stop offset="0.6" stopColor="#E7B84E" />
          <stop offset="1" stopColor="#C18B2C" />
        </linearGradient>
      </defs>
      {/* messenger's staff */}
      <rect x="15" y="6.5" width="2" height="20.5" rx="1" fill="url(#hermesGold)" />
      {/* caduceus knob */}
      <circle cx="16" cy="6" r="2.7" fill="url(#hermesGold)" />
      {/* left wing */}
      <path
        d="M15 11.6 C 10.5 8.4, 6 9, 3.8 12.4 C 7.6 11.1, 11.1 12.7, 14 16.2 Z"
        fill="url(#hermesGold)"
      />
      {/* right wing */}
      <path
        d="M17 11.6 C 21.5 8.4, 26 9, 28.2 12.4 C 24.4 11.1, 20.9 12.7, 18 16.2 Z"
        fill="url(#hermesGold)"
      />
      {/* inner feather hints */}
      <path d="M14.4 18.6 C 11.4 16.8, 8.6 17.2, 6.8 19" stroke="url(#hermesGold)" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
      <path d="M17.6 18.6 C 20.6 16.8, 23.4 17.2, 25.2 19" stroke="url(#hermesGold)" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

interface BrandMarkProps {
  size?: number;
  /** Render inside a rounded-square app-icon chip. */
  chip?: boolean;
  /** Soft gold bloom around the glyph. */
  glow?: boolean;
  className?: string;
}

/** Sidebar / header brand mark. */
export function BrandMark({ size = 28, chip = false, glow = true, className = "" }: BrandMarkProps) {
  const glyph = <HermesGlyph size={chip ? size * 0.66 : size} className={glow ? "brand-glow" : ""} />;
  if (!chip) return <span className={className}>{glyph}</span>;
  return (
    <span
      className={`relative flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: "linear-gradient(160deg, rgba(231,184,78,0.18), rgba(201,150,47,0.10))",
        border: "1px solid rgba(231,184,78,0.22)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 4px 14px rgba(231,184,78,0.22)",
      }}
    >
      {glyph}
    </span>
  );
}

/** The "HERMES" serif wordmark, struck in gold with a slow minted shimmer. */
export function HermesWordmark({ size = 19, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`gold-text-sheen ${className}`}
      style={{
        fontFamily: "var(--serif)",
        fontSize: size,
        fontWeight: 400,
        lineHeight: 1,
        letterSpacing: "0.18em",
        paddingRight: "0.18em",
      }}
    >
      HERMES
    </span>
  );
}

/** Large struck-gold assay seal for chat / empty-state heroes — the Hallmark mark.
 *  A minted circular stamp: breathing aura + a slow specular ring sweeping the rim. */
export function BrandMedallion({ size = 92, className = "" }: GlyphProps) {
  return (
    <span
      className={`ui-stamp ${className}`}
      style={{ width: size, height: size, borderRadius: "50%" }}
    >
      <HermesGlyph size={size * 0.54} className="brand-glow-lg" />
    </span>
  );
}
