import type { Card } from "../shared/cards";
import { gameById, type GameId } from "../shared/games";
import { PlayingCard } from "./cards";
import { FictionalBanner } from "./disclaimer";

type Prompt = { label: string; action: object };

export type EveningView = {
  kind: "loto" | "roulette" | "blackjack";
  phase: string;
  prompts: Prompt[];
  result: { summary: string } | null;
  log: string[];
  last?: number | null;
  drawn?: number[];
  color?: string | null;
  you?: { rows?: number[][]; chips?: number; hand?: Card[]; total?: number; quine?: boolean; carton?: boolean } | null;
  seats: { id: string; nickname: string; chips?: number; quine?: boolean; carton?: boolean; isTurn?: boolean; total?: number | null }[];
  dealer?: Card[];
  dealerHidden?: boolean;
  dealerTotal?: number | null;
};

export function EveningTable({ view, send }: { view: EveningView; send: (payload: object) => void }) {
  const title = gameById(view.kind as GameId).name;
  return (
    <section className="play evening" aria-label={title}>
      <div className="felt-head">
        <span>{title}</span>
        <span>{view.phase === "play" || view.phase === "bet" ? "En cours" : "Résultat"}</span>
      </div>
      {view.kind === "loto" ? (
        <div className={`tv-number ${view.last ? "on" : ""}`} aria-live="polite">
          <p>Dernier numéro</p>
          <strong>{view.last ?? "–"}</strong>
          <p>{view.drawn?.length ?? 0} / 90</p>
        </div>
      ) : null}
      {view.kind === "roulette" ? (
        <div className={`tv-number wheel ${view.color ?? ""}`} aria-live="polite">
          <p>Bille</p>
          <strong>{view.last ?? "–"}</strong>
          <p>{view.color === "red" ? "Rouge" : view.color === "black" ? "Noir" : view.color === "green" ? "Zéro" : "En attente"}</p>
        </div>
      ) : null}
      {view.kind === "blackjack" ? (
        <div className="board">
          <div>
            <p>Croupier {view.dealerTotal ?? ""}</p>
            <div className="holes">
              {(view.dealer ?? []).map((card) => (
                <PlayingCard key={`${card.r}${card.s}`} card={card} />
              ))}
              {view.dealerHidden ? <PlayingCard hidden /> : null}
            </div>
          </div>
          <div>
            <p>Votre main {view.you?.total ?? ""}</p>
            <div className="holes">
              {(view.you?.hand ?? []).map((card) => (
                <PlayingCard key={`${card.r}${card.s}`} card={card} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {view.kind === "loto" && view.you?.rows ? (
        <div className="loto-card" aria-label="Votre carton">
          {view.you.rows.map((row, index) => (
            <div key={index} className="loto-row">
              {row.map((number) => (
                <span key={number} className={view.drawn?.includes(number) ? "hit" : ""}>
                  {number}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      <ul className="roster">
        {view.seats.map((seat) => (
          <li key={seat.id}>
            <strong>{seat.nickname}</strong>
            <span>
              {seat.chips !== undefined ? `${seat.chips} jetons fictifs` : ""}
              {seat.quine ? " · quine" : ""}
              {seat.carton ? " · carton" : ""}
              {seat.total !== undefined && seat.total !== null ? ` · ${seat.total}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {view.result ? (
        <p className="banner" role="status">
          {view.result.summary}
        </p>
      ) : (
        <FictionalBanner compact />
      )}
      <div className="actions">
        {view.prompts.map((prompt) => (
          <button key={prompt.label} type="button" className="btn-brass" onClick={() => send({ t: "action", action: prompt.action })}>
            {prompt.label}
          </button>
        ))}
        {view.phase === "result" || view.phase === "match-over" || view.phase === "scoring" ? (
          <button type="button" className="btn-ghost" onClick={() => send({ t: "continue" })}>
            Rejouer
          </button>
        ) : null}
      </div>
      <p className="note">Jetons et numéros sans valeur réelle. Aucun achat, aucun gain.</p>
    </section>
  );
}
