'use client';

const N = 16;

interface OccuroRingLogoProps {
  size?: number;
  color?: string;
  className?: string;
}

export function OccuroRingLogo({ size = 44, color, className }: OccuroRingLogoProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * (17 / 44);
  const w  = size * (8  / 44);
  const h  = size * (9  / 44);
  const rx = size * (4  / 44);

  const shards = Array.from({ length: N }, (_, i) => {
    const angle = -Math.PI / 2 + (i / N) * 2 * Math.PI;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    const rot = (angle * 180 / Math.PI) + 90;
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
          fill={color ?? 'currentColor'}
          transform={`rotate(${s.rot} ${s.x} ${s.y})`}
        />
      ))}
    </svg>
  );
}
