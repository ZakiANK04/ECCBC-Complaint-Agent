import { ENTRY } from "../lib/session";
import { wavePath } from "./Ribbon";

const RING_RADIUS = 62;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const ease = "cubic-bezier(0.7, 0, 0.2, 1)";

/** One red sheet with a wavy leading and trailing edge. */
function Sheet({ phase, color, delay = 0, opacity = 1 }) {
  // Wavy edges scale with the screen so the wave stays gentle on phones.
  const WAVE = Math.round(Math.min(140, Math.max(56, window.innerWidth * 0.1)));
  const cycles = window.innerWidth < 640 ? 1 : 2;
  const edge = wavePath({ width: 1440, height: WAVE, cycles, amplitude: WAVE * 0.36, base: WAVE * 0.5 });
  const animation =
    phase === "cover"
      ? `wipe-cover ${ENTRY.cover - delay}ms ${ease} ${delay}ms both`
      : `wipe-reveal ${ENTRY.reveal - delay}ms ${ease} ${delay}ms both`;
  return (
    <div
      className="absolute inset-x-0"
      style={{ top: -WAVE, height: `calc(100% + ${WAVE * 2}px)`, animation, opacity, willChange: "transform" }}
    >
      <svg viewBox={`0 0 1440 ${WAVE}`} preserveAspectRatio="none" className="block w-full" style={{ height: WAVE }}>
        <path d={edge} fill={color} />
      </svg>
      <div style={{ height: `calc(100% - ${WAVE * 2}px)`, background: color, marginBlock: -1 }} />
      <svg
        viewBox={`0 0 1440 ${WAVE}`}
        preserveAspectRatio="none"
        className="block w-full rotate-180"
        style={{ height: WAVE }}
      >
        <path d={edge} fill={color} />
      </svg>
    </div>
  );
}

/**
 * Sign-in transition: a red wave rises over the login page, the logo lands
 * in the centre while a ring draws around it, then the wave lifts off the
 * workspace that mounted underneath.
 */
export default function EntryTransition({ phase }) {
  const leaving = phase === "reveal";
  return (
    <div className="fixed inset-0 z-[100] overflow-hidden" aria-hidden="true">
      {/* a lighter sheet leads, the brand-red one follows: reads as a wave with depth */}
      <Sheet phase={phase} color="#ff5a63" opacity={0.9} />
      <Sheet phase={phase} color="#e30613" delay={90} />

      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative flex items-center justify-center"
          style={{
            width: 148,
            height: 148,
            animation: leaving
              ? `logo-leave ${Math.round(ENTRY.reveal * 0.55)}ms ease-in both`
              : `logo-pop 520ms cubic-bezier(0.2, 0.9, 0.3, 1.2) ${Math.round(ENTRY.cover * 0.62)}ms both`,
          }}
        >
          <svg viewBox="0 0 148 148" className="absolute inset-0" style={{ animation: "ring-spin 2.4s linear infinite" }}>
            <circle cx="74" cy="74" r={RING_RADIUS} fill="none" stroke="rgb(255 255 255 / 0.22)" strokeWidth="2" />
            <circle
              cx="74"
              cy="74"
              r={RING_RADIUS}
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              style={{
                "--ring-length": RING_LENGTH,
                animation: `ring-draw ${ENTRY.hold}ms cubic-bezier(0.4, 0, 0.2, 1) ${Math.round(ENTRY.cover * 0.8)}ms both`,
              }}
            />
          </svg>
          <img
            src="/eccbc-logo.png"
            alt=""
            width={104}
            height={104}
            className="rounded-full bg-white object-contain p-1.5 shadow-[0_10px_40px_rgb(0_0_0/0.25)]"
            style={{ width: 104, height: 104 }}
          />
        </div>
      </div>
    </div>
  );
}
