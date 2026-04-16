import type { CSSProperties } from 'react';
import type { Event } from '@/types/occuro';

type DecorStyle = 'circles' | 'dots' | 'rings' | 'diagonal';
interface BannerCfg {
  from: string;
  via: string;
  to: string;
  accent: string;
  decor: DecorStyle;
}

// Mirrors occuroapp/src/components/EventImagePlaceholder.tsx. The mobile
// app picks a gradient + decor style based on (in order of specificity)
// subcategory -> event type -> category, so events without an uploaded
// banner still feel distinct per vibe instead of all looking like the
// same gray box.
function getBannerCfg(
  category?: string | null,
  subcategory?: string | null,
  eventType?: string | null,
): BannerCfg {
  const sub = (subcategory ?? '').toLowerCase();
  const type = (eventType ?? '').toLowerCase();
  const cat = (category ?? '').toLowerCase();

  if (sub.includes('techno')) return { from: '#09090f', via: '#1a0a3d', to: '#2d1b69', accent: '#7c3aed', decor: 'circles' };
  if (sub.includes('house')) return { from: '#3b0d02', via: '#7c2d12', to: '#c2410c', accent: '#f97316', decor: 'circles' };
  if (sub.includes('rock')) return { from: '#0f0303', via: '#450a0a', to: '#7f1d1d', accent: '#ef4444', decor: 'diagonal' };
  if (sub.includes('pop')) return { from: '#4a044e', via: '#831843', to: '#9d174d', accent: '#f472b6', decor: 'circles' };
  if (sub.includes('jazz')) return { from: '#271505', via: '#6b3a0a', to: '#a16207', accent: '#fbbf24', decor: 'rings' };
  if (sub.includes('hip') || sub.includes('hop')) return { from: '#06060f', via: '#0f172a', to: '#1e1b4b', accent: '#818cf8', decor: 'dots' };
  if (sub.includes('electronic')) return { from: '#020d1f', via: '#0c1a45', to: '#1e40af', accent: '#38bdf8', decor: 'circles' };
  if (sub.includes('indie')) return { from: '#100d0b', via: '#292524', to: '#44403c', accent: '#a78bfa', decor: 'diagonal' };
  if (sub.includes('classical') || sub.includes('orchestra')) return { from: '#1c1408', via: '#3d2b00', to: '#713f12', accent: '#fcd34d', decor: 'rings' };
  if (sub.includes('yoga') || sub.includes('meditation')) return { from: '#051a16', via: '#0d3d35', to: '#065f46', accent: '#34d399', decor: 'rings' };
  if (sub.includes('fitness')) return { from: '#071a0f', via: '#14532d', to: '#15803d', accent: '#4ade80', decor: 'diagonal' };
  if (sub.includes('wellness') || sub.includes('mental')) return { from: '#0d3d35', via: '#0f766e', to: '#0e7490', accent: '#5eead4', decor: 'rings' };
  if (sub.includes('football') || sub.includes('soccer')) return { from: '#1a2e05', via: '#14532d', to: '#16a34a', accent: '#86efac', decor: 'diagonal' };
  if (sub.includes('basketball')) return { from: '#431407', via: '#7c2d12', to: '#c2410c', accent: '#fb923c', decor: 'circles' };
  if (sub.includes('tennis')) return { from: '#1a2e05', via: '#365314', to: '#4d7c0f', accent: '#bef264', decor: 'dots' };
  if (sub.includes('running') || sub.includes('marathon')) return { from: '#0c1445', via: '#1e3a8a', to: '#1d4ed8', accent: '#93c5fd', decor: 'diagonal' };
  if (sub.includes('swimming')) return { from: '#0c2a4a', via: '#0c4a6e', to: '#0369a1', accent: '#38bdf8', decor: 'rings' };
  if (sub.includes('hackathon') || sub.includes('coding') || sub.includes('ai')) return { from: '#020c18', via: '#0c1a2e', to: '#0c4a6e', accent: '#22d3ee', decor: 'dots' };
  if (sub.includes('tech talk') || sub.includes('techtalk')) return { from: '#0f172a', via: '#1e3a8a', to: '#1e40af', accent: '#60a5fa', decor: 'dots' };
  if (sub.includes('startup')) return { from: '#0f172a', via: '#1e3a5f', to: '#1e40af', accent: '#818cf8', decor: 'circles' };
  if (sub.includes('cooking') || sub.includes('culinary')) return { from: '#3b1202', via: '#7c2d12', to: '#b45309', accent: '#fbbf24', decor: 'rings' };
  if (sub.includes('wine') || sub.includes('tasting')) return { from: '#2d0a3a', via: '#4a1d96', to: '#6d28d9', accent: '#d946ef', decor: 'circles' };
  if (sub.includes('food festival') || sub.includes('brunch')) return { from: '#3d1a00', via: '#92400e', to: '#b45309', accent: '#fcd34d', decor: 'rings' };
  if (sub.includes('exhibition') || sub.includes('gallery')) return { from: '#0f0a1e', via: '#1a103c', to: '#3b0764', accent: '#c084fc', decor: 'rings' };
  if (sub.includes('theater') || sub.includes('theatre')) return { from: '#0a0406', via: '#3b0a0a', to: '#6b1a1a', accent: '#fca5a5', decor: 'diagonal' };
  if (sub.includes('comedy')) return { from: '#2d0a1a', via: '#500724', to: '#9f1239', accent: '#fb7185', decor: 'circles' };
  if (sub.includes('movie') || sub.includes('film') || sub.includes('cinema')) return { from: '#0a0a0a', via: '#111827', to: '#1f2937', accent: '#f59e0b', decor: 'diagonal' };
  if (sub.includes('networking')) return { from: '#0f172a', via: '#1e3a5f', to: '#0c4a6e', accent: '#38bdf8', decor: 'dots' };
  if (sub.includes('volunteering')) return { from: '#14532d', via: '#15803d', to: '#166534', accent: '#86efac', decor: 'rings' };
  if (sub.includes('neighborhood') || sub.includes('social')) return { from: '#0f172a', via: '#1e3a5f', to: '#1e40af', accent: '#93c5fd', decor: 'dots' };
  if (sub.includes('hiking') || sub.includes('camping')) return { from: '#1a2e05', via: '#365314', to: '#3f6212', accent: '#84cc16', decor: 'diagonal' };
  if (sub.includes('picnic') || sub.includes('bbq')) return { from: '#14532d', via: '#166534', to: '#15803d', accent: '#4ade80', decor: 'rings' };

  if (type === 'festival') return { from: '#1e0533', via: '#701a75', to: '#a21caf', accent: '#e879f9', decor: 'circles' };
  if (type === 'concert') return { from: '#030712', via: '#0a0a0f', to: '#1e1b4b', accent: '#818cf8', decor: 'circles' };
  if (type === 'party') return { from: '#1a0010', via: '#500724', to: '#9f1239', accent: '#f43f5e', decor: 'circles' };
  if (type === 'workshop') return { from: '#0a1628', via: '#1e3a8a', to: '#1d4ed8', accent: '#93c5fd', decor: 'dots' };
  if (type === 'conference') return { from: '#050e1a', via: '#0f172a', to: '#1e3a5f', accent: '#60a5fa', decor: 'dots' };
  if (type === 'seminar' || type === 'lecture') return { from: '#0a1628', via: '#1e3a8a', to: '#312e81', accent: '#a5b4fc', decor: 'diagonal' };
  if (type === 'networking') return { from: '#020d1f', via: '#0c4a6e', to: '#0369a1', accent: '#38bdf8', decor: 'dots' };
  if (type === 'exhibition') return { from: '#0f0a1e', via: '#3b0764', to: '#4c1d95', accent: '#c084fc', decor: 'rings' };
  if (type === 'tournament') return { from: '#1a0505', via: '#450a0a', to: '#991b1b', accent: '#f87171', decor: 'diagonal' };
  if (type === 'gala' || type === 'premiere') return { from: '#100c00', via: '#3d2b00', to: '#92400e', accent: '#fcd34d', decor: 'rings' };
  if (type === 'retreat') return { from: '#030f0c', via: '#0d3d35', to: '#064e3b', accent: '#34d399', decor: 'rings' };
  if (type === 'meetup') return { from: '#0a0f20', via: '#0f172a', to: '#1e40af', accent: '#60a5fa', decor: 'dots' };
  if (type === 'trade show') return { from: '#050e1a', via: '#0f172a', to: '#1e3a5f', accent: '#93c5fd', decor: 'diagonal' };

  if (cat.includes('music')) return { from: '#0f0e28', via: '#1e1b4b', to: '#4c1d95', accent: '#a78bfa', decor: 'circles' };
  if (cat.includes('business')) return { from: '#050e1a', via: '#0f172a', to: '#1e3a5f', accent: '#60a5fa', decor: 'dots' };
  if (cat.includes('health')) return { from: '#030f0c', via: '#0d3d35', to: '#065f46', accent: '#34d399', decor: 'rings' };
  if (cat.includes('sport')) return { from: '#1a0505', via: '#7c2d12', to: '#c2410c', accent: '#fb923c', decor: 'diagonal' };
  if (cat.includes('education')) return { from: '#0a1628', via: '#1e3a8a', to: '#312e81', accent: '#93c5fd', decor: 'dots' };
  if (cat.includes('art') || cat.includes('culture')) return { from: '#1a0520', via: '#701a75', to: '#4a044e', accent: '#f0abfc', decor: 'rings' };
  if (cat.includes('food') || cat.includes('drink')) return { from: '#1f0a00', via: '#78350f', to: '#b45309', accent: '#fbbf24', decor: 'rings' };
  if (cat.includes('tech')) return { from: '#020d1f', via: '#0c4a6e', to: '#1e3a8a', accent: '#22d3ee', decor: 'dots' };
  if (cat.includes('community')) return { from: '#071a0f', via: '#14532d', to: '#166534', accent: '#86efac', decor: 'rings' };
  if (cat.includes('outdoor')) return { from: '#0f1a03', via: '#1a2e05', to: '#365314', accent: '#bef264', decor: 'diagonal' };

  return { from: '#0f111a', via: '#111827', to: '#1f2937', accent: '#6b7280', decor: 'circles' };
}

function Circles({ accent }: { accent: string }) {
  return (
    <>
      <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', border: `1.5px solid ${accent}50`, background: `${accent}18` }} />
      <div style={{ position: 'absolute', top: 20, right: 60, width: 60, height: 60, borderRadius: '50%', border: `1px solid ${accent}40`, background: `${accent}10` }} />
      <div style={{ position: 'absolute', bottom: -30, left: -30, width: 110, height: 110, borderRadius: '50%', border: `1px solid ${accent}30`, background: `${accent}12` }} />
      <div style={{ position: 'absolute', bottom: 30, left: 60, width: 28, height: 28, borderRadius: '50%', background: `${accent}55` }} />
    </>
  );
}

function Rings({ accent }: { accent: string }) {
  return (
    <>
      <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', border: `2px solid ${accent}35` }} />
      <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', border: `1.5px solid ${accent}45` }} />
      <div style={{ position: 'absolute', bottom: -40, left: -40, width: 140, height: 140, borderRadius: '50%', border: `1.5px solid ${accent}30` }} />
      <div style={{ position: 'absolute', top: '40%', left: '35%', width: 16, height: 16, borderRadius: '50%', background: `${accent}60` }} />
    </>
  );
}

function Dots({ accent }: { accent: string }) {
  const positions: CSSProperties[] = [
    { top: 12, right: 16 }, { top: 12, right: 32 }, { top: 12, right: 48 },
    { top: 28, right: 16 }, { top: 28, right: 32 }, { top: 28, right: 48 },
    { top: 44, right: 16 }, { top: 44, right: 32 }, { top: 44, right: 48 },
    { bottom: 16, left: 16 }, { bottom: 16, left: 32 }, { bottom: 16, left: 48 },
    { bottom: 32, left: 16 }, { bottom: 32, left: 32 }, { bottom: 32, left: 48 },
  ];
  return (
    <>
      {positions.map((pos, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            ...pos,
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: `${accent}${i % 3 === 0 ? '70' : i % 3 === 1 ? '45' : '28'}`,
          }}
        />
      ))}
      <div style={{ position: 'absolute', top: -30, left: -30, width: 90, height: 90, borderRadius: '50%', border: `1px solid ${accent}25` }} />
    </>
  );
}

function Diagonal({ accent }: { accent: string }) {
  return (
    <>
      <div style={{ position: 'absolute', top: -20, right: 30, width: 3, height: 140, background: `${accent}30`, transform: 'rotate(-35deg)' }} />
      <div style={{ position: 'absolute', top: -20, right: 60, width: 1.5, height: 120, background: `${accent}20`, transform: 'rotate(-35deg)' }} />
      <div style={{ position: 'absolute', top: -20, right: 90, width: 1, height: 100, background: `${accent}15`, transform: 'rotate(-35deg)' }} />
      <div style={{ position: 'absolute', bottom: -10, left: 20, width: 2, height: 100, background: `${accent}25`, transform: 'rotate(-35deg)' }} />
      <div style={{ position: 'absolute', top: 16, left: 16, width: 36, height: 36, borderRadius: '50%', border: `2px solid ${accent}50` }} />
    </>
  );
}

type EventBannerInput = Pick<Event, 'image_url' | 'banner_url' | 'category' | 'subcategory' | 'event_type' | 'title'>;

export function EventBanner({
  event,
  showText = false,
  className = '',
}: {
  event: EventBannerInput;
  showText?: boolean;
  className?: string;
}) {
  const url = event.banner_url ?? event.image_url ?? null;
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={event.title}
        className={`w-full h-full object-cover ${className}`}
      />
    );
  }
  const cfg = getBannerCfg(event.category, event.subcategory, event.event_type);
  return (
    <div
      className={`w-full h-full relative overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${cfg.from}, ${cfg.via}, ${cfg.to})` }}
    >
      {cfg.decor === 'circles' && <Circles accent={cfg.accent} />}
      {cfg.decor === 'rings' && <Rings accent={cfg.accent} />}
      {cfg.decor === 'dots' && <Dots accent={cfg.accent} />}
      {cfg.decor === 'diagonal' && <Diagonal accent={cfg.accent} />}
      {showText && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12 }}>
          {event.category && (
            <div
              style={{
                fontSize: 10,
                color: cfg.accent,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: 2,
                fontWeight: 500,
              }}
            >
              {event.category}
            </div>
          )}
          <div
            style={{
              fontSize: 16,
              color: '#fff',
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {event.title}
          </div>
        </div>
      )}
    </div>
  );
}
