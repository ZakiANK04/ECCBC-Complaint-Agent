const TAU = Math.PI * 2;
const STEP = 24;

/** Closed shape whose top edge is a sine wave and whose bottom is flat (a wavy edge). */
export function wavePath({ width, height, cycles, amplitude, base, phase = 0 }) {
  let d = `M0 ${height}`;
  for (let x = 0; x <= width; x += STEP) {
    const y = base + amplitude * Math.sin((x / width) * TAU * cycles + phase);
    d += ` L${x} ${y.toFixed(1)}`;
  }
  return `${d} L${width} ${height} Z`;
}

/**
 * Band between two sine edges. `cycles` is whole waves per tile, so the
 * shape repeats exactly and can scroll in a seamless loop.
 */
function bandPath({ tile, y, thickness, amplitude, cycles, phase, swell }) {
  const width = tile * 2;
  const top = [];
  const bottom = [];
  for (let x = 0; x <= width; x += STEP) {
    const a = (x / tile) * TAU * cycles + phase;
    const edge = y + amplitude * Math.sin(a);
    top.push(`${x} ${edge.toFixed(1)}`);
    // the band breathes: thicker in the troughs, thinner on the crests
    bottom.push(`${x} ${(edge + thickness + swell * Math.sin(a + 1.9)).toFixed(1)}`);
  }
  return `M${top.join(" L")} L${bottom.reverse().join(" L")} Z`;
}

const TILE = 1440;
const HEIGHT = 420;
const BANDS = [
  { fill: "var(--ribbon-b)", opacity: 0.55, duration: 46, y: 150, thickness: 150, amplitude: 58, cycles: 1, phase: 0.6, swell: 46 },
  { fill: "var(--ribbon-a)", opacity: 1, duration: 32, y: 120, thickness: 104, amplitude: 70, cycles: 1, phase: 2.2, swell: 34 },
  { fill: "var(--ribbon-c)", opacity: 0.75, duration: 24, y: 108, thickness: 14, amplitude: 76, cycles: 1, phase: 2.5, swell: 6 },
];

/**
 * Flowing red ribbon echoing the wave of the ECCBC logo. Each band is drawn
 * twice side by side and slides left by exactly one tile, forever.
 */
export default function Ribbon({ className = "", style }) {
  return (
    <div className={`pointer-events-none overflow-hidden ${className}`} style={style} aria-hidden="true">
      {BANDS.map((band, i) => (
        <svg
          key={i}
          className="ribbon"
          viewBox={`0 0 ${TILE * 2} ${HEIGHT}`}
          preserveAspectRatio="none"
          style={{ animationDuration: `${band.duration}s`, opacity: band.opacity }}
        >
          <path d={bandPath({ tile: TILE, ...band })} fill={band.fill} />
        </svg>
      ))}
    </div>
  );
}
