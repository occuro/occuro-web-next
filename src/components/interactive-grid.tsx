'use client';

import { useEffect, useRef, useCallback } from 'react';

const CHARS = ['·', '·', '·', '○', '◦', '•'];
const ACTIVE_CHARS = ['○', '◦', '●', '◎', '⬡', '◉'];
const CELL = 28;
const RADIUS = 100;
const FADE_SPEED = 0.08;

export function InteractiveGrid({ forceDark }: { forceDark?: boolean } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const cellsRef = useRef<{ x: number; y: number; char: string; activeChar: string; brightness: number }[]>([]);
  const animRef = useRef<number>(0);
  const exclusionRef = useRef<DOMRect[]>([]);
  const dprRef = useRef(1);
  const forceDarkRef = useRef(forceDark);

  const init = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement?.clientWidth ?? window.innerWidth;
    const h = canvas.parentElement?.clientHeight ?? window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    dprRef.current = dpr;

    const cols = Math.ceil(w / CELL);
    const rows = Math.ceil(h / CELL);
    const cells: typeof cellsRef.current = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        cells.push({
          x: col * CELL + CELL / 2,
          y: row * CELL + CELL / 2,
          char: CHARS[Math.floor(Math.random() * CHARS.length)],
          activeChar: ACTIVE_CHARS[Math.floor(Math.random() * ACTIVE_CHARS.length)],
          brightness: 0,
        });
      }
    }
    cellsRef.current = cells;

    // Find the content exclusion zone
    updateExclusion();
  }, []);

  const updateExclusion = () => {
    const els = document.querySelectorAll('[data-grid-exclude]');
    const canvas = canvasRef.current;
    if (!canvas || !els.length) { exclusionRef.current = []; return; }
    const canvasRect = canvas.getBoundingClientRect();
    exclusionRef.current = Array.from(els).map((el) => {
      const r = el.getBoundingClientRect();
      return new DOMRect(
        r.left - canvasRect.left - 40,
        r.top - canvasRect.top - 20,
        r.width + 80,
        r.height + 40,
      );
    });
  };

  useEffect(() => {
    init();
    window.addEventListener('resize', init);
    return () => window.removeEventListener('resize', init);
  }, [init]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isDark = forceDarkRef.current || window.matchMedia('(prefers-color-scheme: dark)').matches;

    const animate = () => {
      const dpr = dprRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const zones = exclusionRef.current;

      for (const cell of cellsRef.current) {
        // Skip cells inside any exclusion zone (content areas)
        const inExclusion = zones.some((ex) => cell.x >= ex.x && cell.x <= ex.x + ex.width && cell.y >= ex.y && cell.y <= ex.y + ex.height);
        if (inExclusion) {
          cell.brightness = Math.max(0, cell.brightness - FADE_SPEED * 3);
          if (cell.brightness < 0.01) continue;
        } else {
          const dx = cell.x - mx;
          const dy = cell.y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < RADIUS) {
            // Sharper falloff: closer = brighter, edge = dim
            const intensity = 1 - (dist / RADIUS);
            cell.brightness = Math.min(1, cell.brightness + intensity * 0.25);
          } else {
            cell.brightness = Math.max(0, cell.brightness - FADE_SPEED);
          }
        }

        const t = cell.brightness;
        if (t < 0.01) continue;

        const char = t > 0.3 ? cell.activeChar : cell.char;
        const alpha = isDark ? t * 0.55 : t * 0.4;

        const color = isDark
          ? `rgba(255, 255, 255, ${alpha})`
          : `rgba(0, 0, 0, ${alpha})`;

        ctx.fillStyle = color;
        ctx.font = `${11 + t * 3}px "Space Grotesk", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.save();
        ctx.translate(cell.x, cell.y);
        if (t > 0.1) {
          const angle = t * 0.3 * (Math.sin(cell.x * 0.01 + cell.y * 0.01) > 0 ? 1 : -1);
          ctx.rotate(angle);
        }
        ctx.fillText(char, 0, 0);
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    // Update exclusion zone periodically (in case of layout shifts)
    const exInterval = setInterval(updateExclusion, 1000);

    animate();
    return () => {
      cancelAnimationFrame(animRef.current);
      clearInterval(exInterval);
    };
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 };
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
