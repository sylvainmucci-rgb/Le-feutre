import { formatDollars } from "../shared/poker/holdem";

export type ChipKind = "c5" | "c25" | "d1" | "d5";

const SPECS: Record<ChipKind, { face: string; edge: string; spot: string; ink: string; label: string }> = {
  c5: { face: "#f4ead8", edge: "#b89a62", spot: "#8d6a32", ink: "#3a2914", label: "5" },
  c25: { face: "#1c6b43", edge: "#f3e6cf", spot: "#f6f1e6", ink: "#f6f1e6", label: "25" },
  d1: { face: "#8e2430", edge: "#efd7a4", spot: "#f0d7a2", ink: "#fff8ee", label: "1" },
  d5: { face: "#1b2744", edge: "#d4b483", spot: "#e6c98a", ink: "#f6f1e6", label: "5" },
};

/** Découpe un montant en centimes en jetons fictifs, du plus gros au plus petit. */
export function breakChips(cents: number): ChipKind[] {
  const out: ChipKind[] = [];
  let left = Math.max(0, Math.trunc(cents));
  const spec: [number, ChipKind][] = [
    [500, "d5"],
    [100, "d1"],
    [25, "c25"],
    [5, "c5"],
  ];
  for (const [value, kind] of spec) {
    const count = Math.min(6, Math.floor(left / value));
    left -= count * value;
    for (let i = 0; i < count; i += 1) out.push(kind);
  }
  if (out.length === 0 && cents > 0) out.push("c5");
  return out.slice(0, 8);
}

export function Chip({ kind }: { kind: ChipKind }) {
  const spec = SPECS[kind];
  const spots = Array.from({ length: 8 }, (_, index) => {
    const angle = (index / 8) * Math.PI * 2;
    const x = 32 + Math.cos(angle) * 27;
    const y = 32 + Math.sin(angle) * 27;
    const deg = (angle * 180) / Math.PI + 90;
    return <rect key={index} x={x - 2.4} y={y - 5} width="4.8" height="10" rx="1" fill={spec.spot} transform={`rotate(${deg} ${x} ${y})`} />;
  });
  return (
    <svg className={`chip ${kind}`} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill={spec.edge} />
      {spots}
      <circle cx="32" cy="32" r="22" fill={spec.face} />
      <circle cx="32" cy="32" r="16" fill="none" stroke={spec.spot} strokeWidth="1.6" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      <text x="32" y="37" textAnchor="middle" fontSize={spec.label.length > 1 ? 12 : 15} fontFamily="Palatino, Georgia, serif" fontWeight="700" fill={spec.ink}>
        {spec.label}
      </text>
    </svg>
  );
}

export function ChipStack({ cents, caption }: { cents: number; caption?: string }) {
  const chips = breakChips(cents);
  const spoken = caption ?? `${formatDollars(cents)} fictifs`;
  return (
    <div className="stack" aria-label={spoken}>
      <div className="pile">
        {chips.map((kind, index) => (
          <Chip key={`${kind}-${index}`} kind={kind} />
        ))}
      </div>
      <span className="stack-value">{formatDollars(cents)}</span>
    </div>
  );
}
