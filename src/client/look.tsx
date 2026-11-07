import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PlayerChip } from "./types";
import { CARD_BACKS, FELT_COLORS, QUIPS, REACTIONS, TRINKETS, isBack, isFelt, quipFor, type BackId, type FeltId, type TrinketId } from "../shared/fun";

type Look = { felt: FeltId; back: BackId; setFelt: (felt: FeltId) => void; setBack: (back: BackId) => void };

export const LookContext = createContext<Look>({
  felt: "vert",
  back: "salon",
  setFelt: () => undefined,
  setBack: () => undefined,
});

const PeopleContext = createContext<PlayerChip[]>([]);

export function PeopleProvider({ players, children }: { players: PlayerChip[]; children: ReactNode }) {
  return <PeopleContext.Provider value={players}>{children}</PeopleContext.Provider>;
}

export function usePerson(id: string): PlayerChip | undefined {
  return useContext(PeopleContext).find((player) => player.id === id);
}

export function loadLook(): { felt: FeltId; back: BackId } {
  try {
    const felt = localStorage.getItem("feutre.felt");
    const back = localStorage.getItem("feutre.back");
    return { felt: isFelt(felt) ? felt : "vert", back: isBack(back) ? back : "salon" };
  } catch {
    return { felt: "vert", back: "salon" };
  }
}

export function LookProvider({ children }: { children: ReactNode }) {
  const initial = loadLook();
  const [felt, setFeltState] = useState<FeltId>(initial.felt);
  const [back, setBackState] = useState<BackId>(initial.back);
  const setFelt = (next: FeltId) => {
    setFeltState(next);
    try {
      localStorage.setItem("feutre.felt", next);
    } catch {
      /* ignore */
    }
  };
  const setBack = (next: BackId) => {
    setBackState(next);
    try {
      localStorage.setItem("feutre.back", next);
    } catch {
      /* ignore */
    }
  };
  return <LookContext.Provider value={{ felt, back, setFelt, setBack }}>{children}</LookContext.Provider>;
}

export function useLook(): Look {
  return useContext(LookContext);
}

export function Trinket({ id }: { id?: string }) {
  if (!id || id === "rien") return null;
  return (
    <span className={`trinket trinket-${id}`} aria-hidden="true">
      {id === "canard" ? <Duck /> : null}
      {id === "cigare" ? <Cigar /> : null}
      {id === "verre" ? <Glass /> : null}
      {id === "de" ? <Die /> : null}
      {id === "etoile" ? <Star /> : null}
    </span>
  );
}

function Duck() {
  return (
    <svg viewBox="0 0 32 32">
      <ellipse cx="14" cy="22" rx="10" ry="6" fill="#f2c14e" />
      <circle cx="22" cy="14" r="6" fill="#f6d56a" />
      <path d="M27 14h4l-2 2z" fill="#e07a2f" />
      <circle cx="24" cy="13" r="1" fill="#1b1714" />
    </svg>
  );
}

function Cigar() {
  return (
    <svg viewBox="0 0 32 32">
      <rect x="4" y="14" width="22" height="6" rx="3" fill="#6b3a22" transform="rotate(-18 15 17)" />
      <rect x="20" y="10" width="6" height="6" rx="1" fill="#c4784a" transform="rotate(-18 23 13)" />
    </svg>
  );
}

function Glass() {
  return (
    <svg viewBox="0 0 32 32">
      <path d="M10 6h12l-2 12a4 4 0 0 1-8 0z" fill="#d7e8f7" stroke="#8fb4d6" />
      <path d="M16 18v6M12 26h8" stroke="#e6c98a" strokeWidth="1.6" />
    </svg>
  );
}

function Die() {
  return (
    <svg viewBox="0 0 32 32">
      <rect x="6" y="6" width="20" height="20" rx="4" fill="#f3e2c4" stroke="#8d6a32" />
      <circle cx="12" cy="12" r="1.6" fill="#1b1714" />
      <circle cx="20" cy="20" r="1.6" fill="#1b1714" />
      <circle cx="16" cy="16" r="1.6" fill="#1b1714" />
    </svg>
  );
}

function Star() {
  return (
    <svg viewBox="0 0 32 32">
      <path d="M16 4l3 8h8l-6.5 5 2.5 8L16 20l-7 5 2.5-8L5 12h8z" fill="#f2d56b" />
    </svg>
  );
}

export function CroupierLine({ seed }: { seed: string }) {
  return <p className="croupier">{quipFor(seed)}</p>;
}

export function Confetti({ burst }: { burst: number }) {
  if (burst === 0) return null;
  return (
    <div className="confetti" key={burst} aria-hidden="true">
      {Array.from({ length: 16 }, (_, index) => (
        <i key={index} />
      ))}
    </div>
  );
}

export function Ambiance({
  trinket,
  onTrinket,
  onReact,
}: {
  trinket: string;
  onTrinket: (id: TrinketId) => void;
  onReact: (emoji: string) => void;
}) {
  const { felt, back, setFelt, setBack } = useLook();
  return (
    <div className="ambiance">
      <div className="swatches" role="group" aria-label="Couleur du feutre">
        {FELT_COLORS.map((item) => (
          <button key={item.id} type="button" className={`swatch felt-${item.id}`} aria-pressed={felt === item.id} aria-label={item.label} onClick={() => setFelt(item.id)} />
        ))}
      </div>
      <div className="swatches" role="group" aria-label="Dos des cartes">
        {CARD_BACKS.map((item) => (
          <button key={item.id} type="button" className={`swatch back-${item.id}`} aria-pressed={back === item.id} aria-label={item.label} onClick={() => setBack(item.id)} />
        ))}
      </div>
      <div className="swatches" role="group" aria-label="Objet sur la table">
        {TRINKETS.map((item) => (
          <button key={item.id} type="button" className="btn-ghost tiny" aria-pressed={trinket === item.id} onClick={() => onTrinket(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="swatches" role="group" aria-label="Réaction">
        {REACTIONS.map((emoji) => (
          <button key={emoji} type="button" className="react" onClick={() => onReact(emoji)}>
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

export function useQuips(seed: string): string {
  const [line, setLine] = useState(seed);
  useEffect(() => setLine(seed), [seed]);
  return QUIPS.includes(line) ? line : quipFor(line);
}
