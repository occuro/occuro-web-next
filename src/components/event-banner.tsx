import type { CSSProperties } from 'react';
import {
  Beer, Disc3, Dumbbell, Guitar, HeartPulse, Mic2, Music, Music2,
  PartyPopper, Skull, Sparkles, Theater, TreePine, Trophy, Users,
  UtensilsCrossed,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Event } from '@/types/occuro';

// Pick the icon that best represents an event — subcategory is most
// specific, then event_type, then the broad category. Mirrors the
// mapping in occuroapp/src/components/EventImagePlaceholder.tsx.
function getBannerIcon(
  category?: string | null,
  subcategory?: string | null,
  eventType?: string | null,
): LucideIcon | null {
  const sub = (subcategory ?? '').toLowerCase();
  const type = (eventType ?? '').toLowerCase();
  const cat = (category ?? '').toLowerCase();

  if (sub.includes('techno') || sub.includes('house') || sub.includes('electronic')) return Disc3;
  if (sub.includes('rock')) return Guitar;
  if (sub.includes('metal')) return Skull;
  if (sub.includes('pop')) return Music;
  if (sub.includes('hip') || sub.includes('hop')) return Mic2;
  if (sub.includes('jazz')) return Music2;
  if (sub.includes('classical') || sub.includes('orchestra')) return Music2;
  if (sub.includes('indie')) return Music;
  if (sub.includes('yoga') || sub.includes('meditation') || sub.includes('wellness') || sub.includes('mental')) return Sparkles;
  if (sub.includes('fitness')) return Dumbbell;
  if (sub.includes('football') || sub.includes('soccer') || sub.includes('basketball') || sub.includes('tennis')) return Trophy;
  if (sub.includes('traditional')) return Beer;
  if (sub.includes('theater') || sub.includes('theatre')) return Theater;

  if (type === 'volksfest') return Beer;
  if (type === 'festival') return PartyPopper;
  if (type === 'party') return Disc3;
  if (type === 'concert') return Music;

  if (cat === 'music') return Music;
  if (cat === 'sports') return Trophy;
  if (cat === 'health' || cat === 'wellness') return HeartPulse;
  if (cat === 'food' || cat === 'kulinarik') return UtensilsCrossed;
  if (cat === 'outdoor') return TreePine;
  if (cat === 'community') return Users;
  if (cat === 'culture') return Sparkles;

  return null;
}

type DecorStyle = 'circles' | 'dots' | 'rings' | 'diagonal';
type Tone = keyof typeof TONES;
interface BannerCfg {
  from: string;
  via: string;
  to: string;
  accent: string;
  angle: number;
  decor: DecorStyle;
}

// Placeholder banners are deliberately MONOCHROME. Saturated per-genre
// gradients (blue for tech, green for outdoor, magenta for festivals, …) made
// the feed read like a colour swatch: with a dozen cards on screen the hues
// fought each other and looked cheap. Events are told apart by their icon and
// decor pattern instead, so the surface stays the same clean near-black as the
// rest of the app and real event photos are the only colour in the feed.
//
// Ported 1:1 from occuroapp/src/components/EventImagePlaceholder.tsx so web
// and mobile show the identical placeholder for the same event.
const TONES = {
  // Four near-black steps. The spread is small on purpose — enough that two
  // adjacent cards don't look identical, never enough to read as "a colour".
  deep: ['#08080A', '#121214', '#1C1C20'],
  base: ['#0A0A0C', '#161618', '#242428'],
  soft: ['#0C0C0E', '#1A1A1D', '#2A2A2E'],
  warm: ['#0A0908', '#171614', '#26241F'],
} as const;

// 135deg = top-left -> bottom-right, 45deg = bottom-left -> top-right.
// Same two directions the mobile version alternates between.
const DIAG_DOWN = 135;
const DIAG_UP = 45;

function banner(tone: Tone, decor: DecorStyle, opts?: { up?: boolean }): BannerCfg {
  const [from, via, to] = TONES[tone];
  return {
    from,
    via,
    to,
    // Decor shapes are drawn at low opacity, so a light neutral is all the
    // "accent" that is needed — no hue.
    accent: '#8A8A90',
    angle: opts?.up ? DIAG_UP : DIAG_DOWN,
    decor,
  };
}

// Picks tone + decor style based on (in order of specificity) subcategory ->
// event type -> category, so events without an uploaded banner still feel
// distinct per vibe instead of all looking like the same gray box.
function getBannerCfg(
  category?: string | null,
  subcategory?: string | null,
  eventType?: string | null,
): BannerCfg {
  const sub = (subcategory ?? '').toLowerCase();
  const type = (eventType ?? '').toLowerCase();
  const cat = (category ?? '').toLowerCase();

  // ── Subcategory / Genre (most specific) ──────────────────────────────
  if (sub.includes('techno')) return banner('deep', 'circles');
  if (sub.includes('house')) return banner('base', 'circles', { up: true });
  if (sub.includes('rock')) return banner('deep', 'diagonal');
  if (sub.includes('pop')) return banner('soft', 'circles');
  if (sub.includes('jazz')) return banner('warm', 'rings');
  if (sub.includes('hip') || sub.includes('hop')) return banner('deep', 'dots', { up: true });
  if (sub.includes('electronic')) return banner('base', 'circles');
  if (sub.includes('indie')) return banner('warm', 'diagonal');
  if (sub.includes('classical') || sub.includes('orchestra')) return banner('warm', 'rings');
  if (sub.includes('yoga') || sub.includes('meditation')) return banner('soft', 'rings');
  if (sub.includes('fitness')) return banner('base', 'diagonal', { up: true });
  if (sub.includes('wellness') || sub.includes('mental')) return banner('soft', 'rings');
  if (sub.includes('football') || sub.includes('soccer')) return banner('deep', 'diagonal');
  if (sub.includes('basketball')) return banner('warm', 'circles');
  if (sub.includes('tennis')) return banner('base', 'dots');
  if (sub.includes('running') || sub.includes('marathon')) return banner('deep', 'diagonal', { up: true });
  if (sub.includes('swimming')) return banner('base', 'rings');
  if (sub.includes('hackathon') || sub.includes('coding') || sub.includes('ai')) return banner('deep', 'dots');
  if (sub.includes('tech talk') || sub.includes('techtalk')) return banner('base', 'dots');
  if (sub.includes('startup')) return banner('soft', 'circles', { up: true });
  if (sub.includes('cooking') || sub.includes('culinary')) return banner('warm', 'rings');
  if (sub.includes('wine') || sub.includes('tasting')) return banner('warm', 'circles');
  if (sub.includes('food festival') || sub.includes('brunch')) return banner('warm', 'rings', { up: true });
  if (sub.includes('exhibition') || sub.includes('gallery')) return banner('soft', 'rings');
  if (sub.includes('theater') || sub.includes('theatre')) return banner('deep', 'diagonal');
  if (sub.includes('comedy')) return banner('soft', 'circles');
  if (sub.includes('movie') || sub.includes('film') || sub.includes('cinema')) return banner('deep', 'diagonal');
  if (sub.includes('networking')) return banner('base', 'dots');
  if (sub.includes('volunteering')) return banner('soft', 'rings');
  if (sub.includes('neighborhood') || sub.includes('social')) return banner('base', 'dots');
  if (sub.includes('hiking') || sub.includes('camping')) return banner('warm', 'diagonal');
  if (sub.includes('picnic') || sub.includes('bbq')) return banner('warm', 'rings', { up: true });

  // ── Event Type ───────────────────────────────────────────────────────
  if (type === 'festival') return banner('soft', 'circles');
  if (type === 'concert') return banner('deep', 'circles');
  if (type === 'party') return banner('base', 'circles');
  if (type === 'workshop') return banner('base', 'dots');
  if (type === 'conference') return banner('deep', 'dots');
  if (type === 'seminar' || type === 'lecture') return banner('base', 'diagonal');
  if (type === 'networking') return banner('soft', 'dots');
  if (type === 'exhibition') return banner('soft', 'rings');
  if (type === 'tournament') return banner('deep', 'diagonal');
  if (type === 'gala' || type === 'premiere') return banner('warm', 'rings');
  if (type === 'retreat') return banner('soft', 'rings');
  if (type === 'meetup') return banner('base', 'dots');
  if (type === 'trade show') return banner('deep', 'diagonal');

  // ── Main Category ────────────────────────────────────────────────────
  if (cat.includes('music')) return banner('deep', 'circles');
  if (cat.includes('business')) return banner('base', 'dots');
  if (cat.includes('health')) return banner('soft', 'rings');
  if (cat.includes('sport')) return banner('base', 'diagonal');
  if (cat.includes('education')) return banner('deep', 'dots');
  if (cat.includes('art') || cat.includes('culture')) return banner('soft', 'rings');
  if (cat.includes('food') || cat.includes('drink')) return banner('warm', 'rings');
  if (cat.includes('tech')) return banner('deep', 'dots');
  if (cat.includes('community')) return banner('soft', 'rings');
  if (cat.includes('outdoor')) return banner('warm', 'circles');

  // ── Default ──────────────────────────────────────────────────────────
  return banner('base', 'circles');
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
  const Icon = getBannerIcon(event.category, event.subcategory, event.event_type);
  return (
    <div
      className={`w-full h-full relative overflow-hidden ${className}`}
      style={{ background: `linear-gradient(${cfg.angle}deg, ${cfg.from}, ${cfg.via}, ${cfg.to})` }}
    >
      {cfg.decor === 'circles' && <Circles accent={cfg.accent} />}
      {cfg.decor === 'rings' && <Rings accent={cfg.accent} />}
      {cfg.decor === 'dots' && <Dots accent={cfg.accent} />}
      {cfg.decor === 'diagonal' && <Diagonal accent={cfg.accent} />}
      {Icon && (
        <div
          style={{
            position: 'absolute',
            top: -16,
            right: -16,
            opacity: 0.22,
            transform: 'rotate(-8deg)',
            pointerEvents: 'none',
          }}
        >
          <Icon size={140} color={cfg.accent} strokeWidth={1.5} />
        </div>
      )}
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
