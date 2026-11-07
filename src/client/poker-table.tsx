import { useEffect, useMemo, useRef, useState } from "react";
import { formatDollars } from "../shared/poker/holdem";
import { Avatar } from "./avatar";
import { PlayingCard } from "./cards";
import { ChipStack } from "./chips";
import { FictionalBanner } from "./disclaimer";
import { playSound } from "./sound";
import type { PokerSeat, PokerView } from "./types";

const STREETS: Record<string, string> = {
  preflop: "Préflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
};

export function PokerTable({ view, send, youId }: { view: PokerView; send: (payload: object) => void; youId: string }) {
  const [amount, setAmount] = useState(view.you.legal?.raise?.minTo ?? view.bb);
  const seen = useRef<{ pot: number; board: number; hand: number; result: string } | null>(null);
  const minRaise = view.you.legal?.raise?.minTo;
  const resultLine = view.result?.summary ?? "";
  useEffect(() => {
    if (minRaise) setAmount(minRaise);
  }, [minRaise, view.handNo, view.street]);
  useEffect(() => {
    const snap = {
      pot: view.pot,
      board: view.board.length,
      hand: view.handNo,
      result: resultLine,
    };
    const before = seen.current;
    seen.current = snap;
    if (!before) return;
    if (snap.result && snap.result !== before.result) playSound("win");
    else if (snap.hand !== before.hand || snap.board > before.board) playSound("deal");
    else if (snap.pot !== before.pot) playSound("chip");
  }, [view.pot, view.board.length, view.handNo, resultLine]);

  const hero = view.seats.findIndex((seat) => seat.id === youId);
  const ordered = useMemo(() => {
    if (hero < 0) return view.seats;
    return view.seats.map((_, index) => view.seats[(hero + index) % view.seats.length]!);
  }, [view.seats, hero]);
  const legal = view.you.legal;
  const winners = new Set(view.result?.awards?.map((award) => award.playerId) ?? []);
  const you = ordered[0];
  return (
    <section className="play" aria-label="Table de Hold'em">
      <div className="felt-head">
        <span>Donne {view.handNo}</span>
        <span>{STREETS[view.street] ?? view.street}</span>
        <span>
          Blinds {formatDollars(view.sb)} / {formatDollars(view.bb)}
        </span>
      </div>
      <div className="stage">
        <div className="rail">
          <div className="cushion">
            <div className={`felt seats-${ordered.length}`}>
              <p className="watermark" aria-hidden="true">
                LF
              </p>
              <div className="center">
                <ChipStack cents={view.pot} caption={`Pot fictif ${formatDollars(view.pot)}`} />
                <p className="plaque">Pot {formatDollars(view.pot)} · fictif</p>
                <div className="board">
                  {view.board.length === 0 ? (
                    <p className="waiting-cards">Cartes communes à venir</p>
                  ) : (
                    view.board.map((card) => <PlayingCard key={`${card.r}${card.s}`} card={card} />)
                  )}
                </div>
              </div>
              {ordered.map((seat, index) =>
                index === 0 ? null : (
                  <SeatPlate key={seat.id} seat={seat} index={index} win={winners.has(seat.id)} />
                ),
              )}
              {ordered.map((seat, index) =>
                seat.streetBet > 0 ? (
                  <div key={`bet-${seat.id}`} className={`bet bet-i${index}`}>
                    <ChipStack cents={seat.streetBet} />
                  </div>
                ) : null,
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="hero-dock">
        <div className={`plate hero-plate ${view.toActId === youId ? "turn" : ""} ${you?.folded ? "folded" : ""}`}>
          <Avatar name={you?.nickname || "Vous"} />
          <div>
            <strong>{you?.nickname ?? "Vous"}</strong>
            <span>Tapis fictif {formatDollars(view.you.stack)}</span>
            <span className="tags">
              {you?.isButton ? "Bouton" : ""} {you?.isSmallBlind ? "Petite blind" : ""} {you?.isBigBlind ? "Grosse blind" : ""}{" "}
              {you?.allIn ? "Tapis" : ""} {you?.folded ? "Couché" : ""}
            </span>
          </div>
        </div>
        <div className="holes">
          {view.you.hole ? (
            view.you.hole.map((card) => <PlayingCard key={`${card.r}${card.s}`} card={card} />)
          ) : (
            <>
              <PlayingCard hidden />
              <PlayingCard hidden />
            </>
          )}
        </div>
        <p className="turn-live" aria-live="polite">
          {view.toActId === youId ? "C'est à vous." : "En attente d'un autre joueur."}
        </p>
      </div>
      {view.result ? (
        <p className="banner" role="status">
          {view.result.summary} Ces dollars n&apos;ont aucune valeur réelle.
        </p>
      ) : (
        <FictionalBanner compact />
      )}
      {legal ? (
        <div className="actions">
          {legal.fold ? (
            <button type="button" className="btn-ghost" onClick={() => send({ t: "action", action: { type: "fold" } })}>
              Se coucher
            </button>
          ) : null}
          {legal.check ? (
            <button type="button" className="btn-brass" onClick={() => send({ t: "action", action: { type: "check" } })}>
              Parole
            </button>
          ) : null}
          {legal.call !== null ? (
            <button type="button" className="btn-brass" onClick={() => send({ t: "action", action: { type: "call" } })}>
              Suivre {formatDollars(legal.call)}
            </button>
          ) : null}
          {legal.raise ? (
            <div className="raise">
              <label htmlFor="bet">
                {view.you.toCall > 0 ? "Relance à" : "Mise"} {formatDollars(amount)}
              </label>
              <input
                id="bet"
                type="range"
                min={legal.raise.minTo}
                max={legal.raise.maxTo}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
              <button type="button" className="btn-brass" onClick={() => send({ t: "action", action: { type: "bet", amount } })}>
                {legal.raise.short ? `Tapis ${formatDollars(amount)}` : `${view.you.toCall > 0 ? "Relancer à" : "Miser"} ${formatDollars(amount)}`}
              </button>
            </div>
          ) : null}
        </div>
      ) : view.phase !== "betting" ? (
        <button type="button" className="btn-brass" onClick={() => send({ t: "continue" })}>
          {view.phase === "match-over" ? "Rejouer" : "Donne suivante"}
        </button>
      ) : null}
    </section>
  );
}

function SeatPlate({ seat, index, win }: { seat: PokerSeat; index: number; win: boolean }) {
  return (
    <article className={`seat seat-i${index} ${seat.isTurn ? "turn" : ""} ${seat.folded ? "folded" : ""} ${win ? "win" : ""}`}>
      <div className="backs">
        {seat.hole ? (
          seat.hole.map((card) => <PlayingCard key={`${card.r}${card.s}${seat.id}`} card={card} />)
        ) : seat.folded ? null : (
          <>
            <PlayingCard hidden />
            <PlayingCard hidden />
          </>
        )}
      </div>
      <div className="plate">
        <Avatar name={seat.nickname} />
        <strong>{seat.nickname}</strong>
        <span>{formatDollars(seat.stack)}</span>
        <span className="tags">
          {seat.isButton ? "B" : ""} {seat.isSmallBlind ? "SB" : ""} {seat.isBigBlind ? "BB" : ""} {seat.allIn ? "Tapis" : ""}{" "}
          {seat.folded ? "Couché" : ""}
        </span>
      </div>
    </article>
  );
}
