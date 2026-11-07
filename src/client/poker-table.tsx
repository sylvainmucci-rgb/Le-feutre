import { useEffect, useMemo, useRef, useState } from "react";
import type { Card } from "../shared/cards";
import { formatDollars } from "../shared/poker/holdem";
import { clampRaise, sizedRaise } from "./bet-size";
import { Avatar } from "./avatar";
import { Trinket, usePerson } from "./look";
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
  const [discard, setDiscard] = useState<Card[]>([]);
  const [pending, setPending] = useState("");
  const [pre, setPre] = useState<"none" | "checkfold" | "callany">("none");
  const [scoop, setScoop] = useState<{ id: string; cents: number }[]>([]);
  const bets = useRef<Record<string, number>>({});
  const preFired = useRef(false);
  const turnKey = useRef("");
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
  useEffect(() => {
    const previous = bets.current;
    const flying: { id: string; cents: number }[] = [];
    for (const seat of view.seats) {
      const before = previous[seat.id] ?? 0;
      if (before > 0 && seat.streetBet === 0) flying.push({ id: seat.id, cents: before });
      previous[seat.id] = seat.streetBet;
    }
    if (flying.length === 0) return;
    setScoop(flying);
    const timer = window.setTimeout(() => setScoop([]), 280);
    return () => window.clearTimeout(timer);
  }, [view.seats]);
  function act(action: object, label: string) {
    setPending(label);
    setPre("none");
    send({ t: "action", action });
  }

  const hero = view.seats.findIndex((seat) => seat.id === youId);
  const ordered = useMemo(() => {
    if (hero < 0) return view.seats;
    return view.seats.map((_, index) => view.seats[(hero + index) % view.seats.length]!);
  }, [view.seats, hero]);
  const legal = view.you.legal;
  const winners = new Set(view.result?.awards?.map((award) => award.playerId) ?? []);
  const you = ordered[0];
  const heroPerson = usePerson(youId);
  const streetBet = you?.streetBet ?? 0;
  const myTurn = view.toActId === youId && Boolean(legal);
  const turn = `${view.toActId}|${view.handNo}|${view.street}`;
  useEffect(() => {
    if (turnKey.current !== turn) {
      turnKey.current = turn;
      preFired.current = false;
      setPending("");
    }
    if (!myTurn || !legal || preFired.current) return;
    if (pre === "checkfold") {
      preFired.current = true;
      if (legal.check) act({ type: "check" }, "Checker");
      else if (legal.fold) act({ type: "fold" }, "Couché");
    } else if (pre === "callany" && legal.call !== null) {
      preFired.current = true;
      act({ type: "call" }, `Suivre ${formatDollars(legal.call)}`);
    }
  }, [turn, myTurn, legal, pre]);
  function jump(fraction: number | "min" | "all") {
    if (!legal?.raise) return;
    if (fraction === "min") setAmount(legal.raise.minTo);
    else if (fraction === "all") setAmount(legal.raise.maxTo);
    else setAmount(sizedRaise({ pot: view.pot, toCall: view.you.toCall, streetBet, minTo: legal.raise.minTo, maxTo: legal.raise.maxTo, fraction }));
  }
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
              {scoop.map((chip) => {
                const index = ordered.findIndex((seat) => seat.id === chip.id);
                if (index < 0) return null;
                return (
                  <div key={`scoop-${chip.id}-${chip.cents}`} className={`bet scoop bet-i${index}`}>
                    <ChipStack cents={chip.cents} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="hero-dock">
        <div className={`plate hero-plate ${view.toActId === youId ? "turn" : ""} ${you?.folded ? "folded" : ""}`}>
          <Avatar name={you?.nickname || "Vous"} reaction={heroPerson?.reaction} timing={view.toActId === youId} />
          <Trinket id={heroPerson?.trinket} />
          <div>
            <strong>{you?.nickname ?? "Vous"}</strong>
            <span>Tapis fictif {formatDollars(view.you.stack)}</span>
            <span className="tags">
              {you?.isButton ? "Bouton" : ""} {you?.isSmallBlind ? "Petite blind" : ""} {you?.isBigBlind ? "Grosse blind" : ""}{" "}
              {you?.allIn ? "Tapis" : ""} {you?.folded ? "Couché" : ""}
            </span>
          </div>
        </div>
        <div className={Array.isArray(view.you.hole) && view.you.hole.length > 3 ? "fan holes-fan" : "holes"} data-count={view.you.hole?.length ?? 0}>
          {view.you.hole && view.you.hole.length > 0 ? (
            view.you.hole.map((card) => (
              <span key={`${card.r}${card.s}`} className="shell">
                <PlayingCard
                  card={card}
                  onClick={
                    view.phase === "draw" && view.toActId === youId
                      ? () =>
                          setDiscard((current) =>
                            current.some((item) => item.r === card.r && item.s === card.s)
                              ? current.filter((item) => !(item.r === card.r && item.s === card.s))
                              : [...current, card],
                          )
                      : undefined
                  }
                  dimmed={view.phase === "draw" && discard.some((item) => item.r === card.r && item.s === card.s)}
                />
              </span>
            ))
          ) : (
            <>
              <PlayingCard hidden />
              <PlayingCard hidden />
            </>
          )}
        </div>
        <p className="turn-live" aria-live="polite">
          {pending ? pending : view.toActId === youId ? "C'est à vous." : "En attente d'un autre joueur."}
        </p>
      </div>
      {view.result ? (
        <p className="banner" role="status">
          {view.result.summary} Ces dollars n&apos;ont aucune valeur réelle.
        </p>
      ) : (
        <FictionalBanner compact />
      )}
      {view.you.canRebuy ? (
        <button type="button" className="btn-brass" onClick={() => send({ t: "rebuy" })}>
          Recaver le tapis initial ({view.you.rebuys ?? 0}/3)
        </button>
      ) : null}
      {view.phase === "draw" && view.toActId === youId ? (
        <div className="actions">
          <button type="button" className="btn-brass" onClick={() => send({ t: "action", action: { type: "discard", cards: discard } })}>
            {discard.length === 0 ? "Garder les cinq cartes" : `Échanger ${discard.length}`}
          </button>
        </div>
      ) : null}
      {view.phase === "betting" && !myTurn ? (
        <div className="pre-actions">
          <label>
            <input type="checkbox" checked={pre === "checkfold"} onChange={() => setPre(pre === "checkfold" ? "none" : "checkfold")} />
            Check/Fold auto
          </label>
          <label>
            <input type="checkbox" checked={pre === "callany"} onChange={() => setPre(pre === "callany" ? "none" : "callany")} />
            Suivre tout
          </label>
        </div>
      ) : null}
      {legal ? (
        <div className="action-dock">
          {legal.fold ? (
            <button type="button" className="btn-ghost" disabled={Boolean(pending)} onClick={() => act({ type: "fold" }, "Couché")}>
              Se coucher
            </button>
          ) : (
            <span />
          )}
          {legal.check ? (
            <button type="button" className="btn-brass" disabled={Boolean(pending)} onClick={() => act({ type: "check" }, "Checker")}>
              Checker
            </button>
          ) : legal.call !== null ? (
            <button type="button" className="btn-brass" disabled={Boolean(pending)} onClick={() => act({ type: "call" }, `Suivre ${formatDollars(legal.call ?? 0)}`)}>
              Suivre {formatDollars(legal.call ?? 0)}
            </button>
          ) : (
            <span />
          )}
          {legal.raise ? (
            <div className="raise">
              <div className="quick">
                <button type="button" onClick={() => jump("min")}>Min</button>
                <button type="button" onClick={() => jump(1 / 2)}>1/2</button>
                <button type="button" onClick={() => jump(3 / 4)}>3/4</button>
                <button type="button" onClick={() => jump(1)}>Pot</button>
                <button type="button" onClick={() => jump("all")}>Tapis</button>
              </div>
              <label htmlFor="bet">
                {view.you.toCall > 0 ? "Relance" : "Mise"} {formatDollars(clampRaise(amount, legal.raise.minTo, legal.raise.maxTo))}
              </label>
              <input
                id="bet"
                type="range"
                min={legal.raise.minTo}
                max={legal.raise.maxTo}
                value={clampRaise(amount, legal.raise.minTo, legal.raise.maxTo)}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
              <button
                type="button"
                className="btn-brass"
                disabled={Boolean(pending)}
                onClick={() => act({ type: "bet", amount: clampRaise(amount, legal.raise!.minTo, legal.raise!.maxTo) }, legal.raise!.short ? "Tapis" : "Relance")}
              >
                {legal.raise.short ? `Tapis ${formatDollars(legal.raise.maxTo)}` : view.you.toCall > 0 ? "Relancer" : "Miser"}
              </button>
            </div>
          ) : null}
        </div>
      ) : view.phase !== "betting" && view.phase !== "draw" ? (
        <button type="button" className="btn-brass" onClick={() => send({ t: "continue" })}>
          {view.phase === "match-over" ? "Rejouer" : "Donne suivante"}
        </button>
      ) : null}
    </section>
  );
}

function SeatPlate({ seat, index, win }: { seat: PokerSeat; index: number; win: boolean }) {
  const person = usePerson(seat.id);
  return (
    <article className={`seat seat-i${index} ${seat.isTurn ? "turn" : ""} ${seat.folded ? "folded" : ""} ${win ? "win" : ""}`}>
      <div className="backs">
        {(seat.up ?? []).map((card) => (
          <PlayingCard key={`${card.r}${card.s}${seat.id}`} card={card} />
        ))}
        {seat.hole
          ? seat.hole.map((card) => <PlayingCard key={`h${card.r}${card.s}${seat.id}`} card={card} />)
          : null}
        {Array.from({ length: seat.hiddenCount ?? (seat.hole || seat.folded ? 0 : 2) }, (_, index) => (
          <PlayingCard key={`b${index}`} hidden />
        ))}
      </div>
      <div className="plate">
        <Trinket id={person?.trinket} />
        <Avatar name={seat.nickname} reaction={person?.reaction} timing={seat.isTurn} />
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
