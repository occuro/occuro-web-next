import { OccuroRingLogo } from './occuro-ring-logo';

/**
 * Die Wortmarke: der Ring plus "OutNow".
 *
 * Der Unterschied zwischen den Wörtern kommt allein aus dem Schriftgewicht —
 * Out in Medium, Now in Bold. Keine zweite Farbe, keine Fläche. Dadurch gibt
 * es keine Mindestgröße und im Dunkelmodus muss nichts umgekehrt werden.
 *
 * `occuro` ist die Firma und gehört NICHT hierher — die steht klein in der
 * Fußzeile und vollständig in den Rechtstexten.
 *
 * Maßverhältnisse identisch zu occuroapp/src/components/OutNowWordmark.tsx,
 * damit App und Web dieselbe Marke zeigen.
 */

const RING_RATIO_STACKED = 0.92;
const RING_RATIO_ROW = 1.0;
const GAP_RATIO_STACKED = 0.3;
const GAP_RATIO_ROW = 0.34;
const TRACKING_RATIO = -0.025;

interface OutNowWordmarkProps {
  /** Schriftgröße in px. Der Ring skaliert automatisch mit. */
  size?: number;
  /** `stacked` = Ring zentral darüber, `row` = Ring links daneben. */
  layout?: 'stacked' | 'row';
  className?: string;
}

export function OutNowWordmark({
  size = 20,
  layout = 'row',
  className,
}: OutNowWordmarkProps) {
  const stacked = layout === 'stacked';
  const ringSize = size * (stacked ? RING_RATIO_STACKED : RING_RATIO_ROW);
  const gap = size * (stacked ? GAP_RATIO_STACKED : GAP_RATIO_ROW);

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        flexDirection: stacked ? 'column' : 'row',
        alignItems: 'center',
        gap,
        lineHeight: 1,
        color: 'inherit',
      }}
    >
      <OccuroRingLogo size={ringSize} />
      <span
        style={{
          fontSize: size,
          fontWeight: 500,
          letterSpacing: size * TRACKING_RATIO,
          whiteSpace: 'nowrap',
          lineHeight: 1,
        }}
      >
        Out<strong style={{ fontWeight: 700 }}>Now</strong>
      </span>
    </span>
  );
}

/**
 * Nur der Schriftzug, ohne Ring. Für Stellen, an denen der Ring eigenständig
 * behandelt wird — im Aufmacher etwa rotiert er animiert, und die Schrift darf
 * nicht mitdrehen. Die Typografie kommt trotzdem von hier, damit es nur eine
 * Quelle dafür gibt.
 */
export function OutNowWordText({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        fontSize: size,
        fontWeight: 500,
        letterSpacing: size * TRACKING_RATIO,
        whiteSpace: 'nowrap',
        lineHeight: 1,
        color: 'inherit',
      }}
    >
      Out<strong style={{ fontWeight: 700 }}>Now</strong>
    </span>
  );
}
