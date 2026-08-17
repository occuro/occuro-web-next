'use client';

/* 24 feine Speichen statt 16 kraeftiger Bloecke: am 17.08.2026 als neues
   Markenzeichen festgelegt. Gleiche Kranzidee, ruhigere Ausfuehrung. */
const N = 24;

interface OccuroRingLogoProps {
  size?: number;
  color?: string;
  className?: string;
}

export function OccuroRingLogo({ size = 44, color, className }: OccuroRingLogoProps) {
  /* Markenfarbe als Vorgabe: das Zeichen traegt sie immer, ausser jemand
     setzt bewusst etwas anderes (z.B. einfarbige Ausgabe fuer den Druck). */
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * (16 / 44);
  const w  = size * (2.4 / 44);
  const h  = size * (7.6 / 44);
  const rx = size * (1.2 / 44);

  const shards = Array.from({ length: N }, (_, i) => {
    const angle = -Math.PI / 2 + (i / N) * 2 * Math.PI;
    /* Gerundet, weil Server und Browser sonst minimal verschiedene
       Nachkommastellen erzeugen und React eine Abweichung meldet. */
    const rd = (v: number) => Math.round(v * 1000) / 1000;
    const x = rd(cx + r * Math.cos(angle));
    const y = rd(cy + r * Math.sin(angle));
    const rot = rd((angle * 180 / Math.PI) + 90);
    return { x, y, rot };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-label="occuro logo"
    >
      {shards.map((s, i) => (
        <rect
          key={i}
          x={s.x - w / 2}
          y={s.y - h / 2}
          width={w}
          height={h}
          rx={rx}
          ry={rx}
          fill={color ?? 'var(--gold)'}
          transform={`rotate(${s.rot} ${s.x} ${s.y})`}
        />
      ))}
    </svg>
  );
}
