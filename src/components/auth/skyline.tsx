// Decorative night-city skyline for the sign-in screen, drawn as SVG (no external image to load or license).
// Buildings are generated from a fixed seed so the server and every visit render the same picture.

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Building = { x: number; w: number; h: number; spire?: number; beacon?: boolean; windows: { x: number; y: number; warm: boolean }[] };

function layer(seed: number, opts: { minH: number; maxH: number; minW: number; maxW: number; lit: number; spires: number; gap: number }) {
  const r = rng(seed);
  const out: Building[] = [];
  let x = -20;
  while (x < 1220) {
    const w = opts.minW + r() * (opts.maxW - opts.minW);
    const h = opts.minH + Math.pow(r(), 1.6) * (opts.maxH - opts.minH);
    const b: Building = { x, w, h, windows: [] };
    if (r() < opts.spires) {
      b.spire = 20 + r() * 50;
      b.beacon = r() < 0.6;
    }
    if (opts.lit > 0) {
      const cols = Math.max(1, Math.floor((w - 8) / 9));
      const rows = Math.floor((h - 14) / 13);
      const density = opts.lit * (0.4 + r());
      for (let row = 0; row < rows; row++)
        for (let c = 0; c < cols; c++) if (r() < density) b.windows.push({ x: x + 5 + c * 9, y: 600 - h + 10 + row * 13, warm: r() < 0.3 });
    }
    out.push(b);
    x += w + opts.gap * r();
  }
  return out;
}

const FAR = layer(7, { minH: 180, maxH: 520, minW: 26, maxW: 60, lit: 0.05, spires: 0.3, gap: 4 });
const MID = layer(21, { minH: 140, maxH: 430, minW: 34, maxW: 72, lit: 0.22, spires: 0.3, gap: 8 });
const NEAR = layer(42, { minH: 70, maxH: 280, minW: 46, maxW: 110, lit: 0.3, spires: 0.12, gap: 3 });

function Layer({ buildings, fill, windowOpacity, rim = 0 }: { buildings: Building[]; fill: string; windowOpacity: number; rim?: number }) {
  return (
    <g>
      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={600 - b.h} width={b.w} height={b.h} fill={fill} />
          {rim > 0 && <rect x={b.x} y={600 - b.h} width={b.w} height={1.5} fill="#ef4444" opacity={rim} />}
          {rim > 0 && <rect x={b.x} y={600 - b.h} width={1.2} height={b.h} fill="#ef4444" opacity={rim * 0.45} />}
          {b.spire && <rect x={b.x + b.w / 2 - 1.5} y={600 - b.h - b.spire} width={3} height={b.spire} fill={fill} />}
          {b.spire && b.beacon && <circle className="iet-beacon" cx={b.x + b.w / 2} cy={600 - b.h - b.spire} r={2.6} fill="#ef4444" style={{ animationDelay: `${(i % 5) * 0.6}s` }} />}
          {b.windows.map((w, j) => (
            <rect key={j} x={w.x} y={w.y} width={4} height={6} fill={w.warm ? "#fde68a" : "#fecaca"} opacity={windowOpacity * (w.warm ? 0.55 : 0.4)} />
          ))}
        </g>
      ))}
    </g>
  );
}

export function Skyline({ className, id = "a" }: { className?: string; id?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax slice" className={className}>
      <defs>
        <linearGradient id={`iet-sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000000" />
          <stop offset="55%" stopColor="#120304" />
          <stop offset="100%" stopColor="#3b0a0d" />
        </linearGradient>
        <radialGradient id={`iet-glow-${id}`} cx="50%" cy="100%" r="60%">
          <stop offset="0%" stopColor="#dc2626" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`iet-ground-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <rect width="1200" height="600" fill={`url(#iet-sky-${id})`} />
      <rect width="1200" height="600" fill={`url(#iet-glow-${id})`} />
      <Layer buildings={FAR} fill="#1c0c0d" windowOpacity={0.35} />
      <Layer buildings={MID} fill="#110607" windowOpacity={0.75} rim={0.35} />
      <Layer buildings={NEAR} fill="#060606" windowOpacity={1} rim={0.5} />
      <rect y="480" width="1200" height="120" fill={`url(#iet-ground-${id})`} />
    </svg>
  );
}
