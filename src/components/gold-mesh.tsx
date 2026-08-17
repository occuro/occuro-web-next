'use client';

import { useEffect, useRef } from 'react';

/**
 * Das Punktfeld hinter der Seite.
 *
 * Ein gleichmaessiges Raster feiner Punkte in der Markenfarbe. Punkte in der
 * Naehe des Zeigers werden heller und ruecken ein Stueck heran — dieselbe
 * Idee wie im Pitch-Deck, nur umgekehrt: dort streben Lichter auf
 * Veranstaltungsorte zu, hier ist der Zeiger der Ort.
 *
 * WARUM ES DAS ALTE ZEICHENRASTER ERSETZT: Das vorherige Raster leuchtete mit
 * Buchstaben auf und wirkte technisch. Punkte in Gold sind ruhiger und tragen
 * die Marke, statt nur ein Effekt zu sein.
 *
 * NUR IM HERO: Eine scroll-getriebene Fassung fuer die Abschnitte darunter
 * war gebaut und wurde am 17.08.2026 wieder entfernt — der Uebergang wirkte
 * gestueckelt statt zusammenhaengend. Lieber ein Effekt an einer Stelle als
 * ein halbgarer ueber die ganze Seite.
 */
export function GoldMesh({
  variante = 'zeiger',
  staerke = 1,
}: {
  variante?: 'zeiger' | 'scrollen';
  staerke?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const ruhig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const schema = window.matchMedia('(prefers-color-scheme: dark)');
    let dunkel = schema.matches;

    let punkte: { hx: number; hy: number; x: number; y: number; p: number }[] = [];
    let mx = -9999, my = -9999;
    const ziel = { x: -9999, y: -9999 };
    let laeuft = true;
    let rafId = 0;

    const ABSTAND = 46;

    const bauen = () => {
      const b = c.getBoundingClientRect();
      const d = Math.min(window.devicePixelRatio || 1, 2);
      c.width = b.width * d;
      c.height = b.height * d;
      c.style.width = `${b.width}px`;
      c.style.height = `${b.height}px`;
      ctx.setTransform(d, 0, 0, d, 0, 0);

      punkte = [];
      for (let x = ABSTAND / 2; x < b.width; x += ABSTAND) {
        for (let y = ABSTAND / 2; y < b.height; y += ABSTAND) {
          // Eigene Phase je Punkt, damit die Scroll-Welle als Feld atmet
          // statt als Linie durchzulaufen.
          punkte.push({ hx: x, hy: y, x, y, p: Math.random() * Math.PI * 2 });
        }
      }
    };

    const zeichnen = () => {
      const b = c.getBoundingClientRect();
      ctx.clearRect(0, 0, b.width, b.height);

      const farbe = dunkel ? '217,196,160' : '138,110,60';

      // Scrollfortschritt dieses Abschnitts: 0 = kommt herein, 1 = ist oben raus.
      const fortschritt = 1 - Math.max(0, Math.min(1,
        (b.top + b.height) / (window.innerHeight + b.height)));

      if (variante === 'zeiger') {
        mx += (ziel.x - mx) * 0.12;
        my += (ziel.y - my) * 0.12;
      }

      for (let i = 0; i < punkte.length; i++) {
        const p = punkte[i];
        let naehe: number;

        if (variante === 'zeiger') {
          const dx = mx - p.hx;
          const dy = my - p.hy;
          const dist = Math.hypot(dx, dy);
          const R = 190;
          naehe = Math.max(0, 1 - dist / R);
          // Leichtes Heranruecken — der Zeiger zieht das Feld ein wenig an.
          const zx = p.hx + dx * naehe * 0.16;
          const zy = p.hy + dy * naehe * 0.16;
          p.x += (zx - p.x) * 0.14;
          p.y += (zy - p.y) * 0.14;
        } else {
          // Eine weiche Welle wandert mit dem Scrollen durchs Feld.
          const w = Math.sin(p.hy * 0.014 - fortschritt * 7 + p.p) * 0.5 + 0.5;
          naehe = ruhig ? 0.35 : w * 0.8;
          p.x = p.hx;
          p.y = p.hy - (ruhig ? 0 : fortschritt * 26);
        }

        const alpha = (0.1 + naehe * 0.55) * staerke;
        ctx.fillStyle = `rgba(${farbe},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.15 + naehe * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (laeuft) rafId = requestAnimationFrame(zeichnen);
    };

    const beiZeiger = (e: PointerEvent) => {
      const b = c.getBoundingClientRect();
      ziel.x = e.clientX - b.left;
      ziel.y = e.clientY - b.top;
    };
    const beiVerlassen = () => { ziel.x = -9999; ziel.y = -9999; };

    bauen();
    zeichnen();
    window.addEventListener('resize', bauen);

    const wirt = c.parentElement;
    if (variante === 'zeiger' && wirt) {
      wirt.addEventListener('pointermove', beiZeiger);
      wirt.addEventListener('pointerleave', beiVerlassen);
    }
    const beiSchema = (e: MediaQueryListEvent) => { dunkel = e.matches; };
    schema.addEventListener('change', beiSchema);

    // Nur rechnen, solange sichtbar.
    const beobachter = new IntersectionObserver((eintraege) => {
      const sichtbar = eintraege[0].isIntersecting;
      if (sichtbar && !laeuft) { laeuft = true; zeichnen(); }
      laeuft = sichtbar;
    }, { threshold: 0 });
    beobachter.observe(c);

    return () => {
      laeuft = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', bauen);
      if (variante === 'zeiger' && wirt) {
        wirt.removeEventListener('pointermove', beiZeiger);
        wirt.removeEventListener('pointerleave', beiVerlassen);
      }
      schema.removeEventListener('change', beiSchema);
      beobachter.disconnect();
    };
  }, [variante, staerke]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
