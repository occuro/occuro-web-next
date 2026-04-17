import { ImageResponse } from 'next/og';

export const alt = 'occuro — Entdecke Events in deiner Nähe';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function loadGoogleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&text=${encodeURIComponent(text)}`;
  try {
    const css = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bot)' },
    }).then((r) => r.text());
    const srcMatch = css.match(/src:\s*url\(([^)]+)\)\s*format\('(truetype|opentype)'\)/);
    const fontUrl = srcMatch?.[1] ?? css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!fontUrl) return null;
    const clean = fontUrl.replace(/^['"]|['"]$/g, '');
    return await fetch(clean).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

// 18-dot ring logo — positioned using trigonometry, same as the SVG
// in src/app/icon.svg but rendered at OG-image resolution.
function OccuroRing({ cx, cy, radius, dotSize }: { cx: number; cy: number; radius: number; dotSize: number }) {
  const dots = [];
  for (let i = 0; i < 18; i++) {
    const angle = (i * 20 * Math.PI) / 180 - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    dots.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: x - dotSize / 2,
          top: y - dotSize / 2,
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          background: 'rgba(255,255,255,0.95)',
        }}
      />,
    );
  }
  return <>{dots}</>;
}

export default async function OpengraphImage() {
  const wordmarkText = 'occuro';
  const taglineText = 'Entdecke Events in deiner Nähe';

  const [outfitBold, poppinsRegular] = await Promise.all([
    loadGoogleFont('Outfit', 700, wordmarkText),
    loadGoogleFont('Poppins', 400, taglineText),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0A0A0B',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Outfit',
        }}
      >
        {/* Violet glow top-right */}
        <div
          style={{
            position: 'absolute',
            top: -260,
            right: -260,
            width: 900,
            height: 900,
            borderRadius: 9999,
            background: 'radial-gradient(circle, rgba(124,58,237,0.38) 0%, rgba(124,58,237,0) 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -320,
            left: -220,
            width: 700,
            height: 700,
            borderRadius: 9999,
            background: 'radial-gradient(circle, rgba(168,85,247,0.22) 0%, rgba(168,85,247,0) 70%)',
          }}
        />

        {/* 18-dot ring logo */}
        <div style={{ position: 'relative', width: 140, height: 140, display: 'flex' }}>
          <OccuroRing cx={70} cy={70} radius={52} dotSize={28} />
        </div>

        {/* Wordmark */}
        <div
          style={{
            marginTop: 36,
            fontSize: 80,
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '-0.04em',
            lineHeight: 1,
            display: 'flex',
          }}
        >
          {wordmarkText}
        </div>

        {/* Tagline */}
        <div
          style={{
            marginTop: 20,
            fontSize: 28,
            color: 'rgba(255,255,255,0.65)',
            fontFamily: 'Poppins',
            fontWeight: 400,
            display: 'flex',
          }}
        >
          {taglineText}
        </div>

        {/* Host tag */}
        <div
          style={{
            position: 'absolute',
            bottom: 44,
            right: 56,
            fontSize: 18,
            color: 'rgba(255,255,255,0.5)',
            fontFamily: 'Poppins',
            fontWeight: 400,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            display: 'flex',
          }}
        >
          app.occuroapp.com
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        ...(outfitBold
          ? [{ name: 'Outfit', data: outfitBold, style: 'normal' as const, weight: 700 as const }]
          : []),
        ...(poppinsRegular
          ? [{ name: 'Poppins', data: poppinsRegular, style: 'normal' as const, weight: 400 as const }]
          : []),
      ],
    },
  );
}
