import { useEffect, useRef } from "react";
import { cardFr, cardKey, suitFr, suitGlyph, SUITS, type Card, type Face, type Suit } from "../shared/cards";
import { Avatar } from "./avatar";
import { PlayingCard } from "./cards";
import { playSound } from "./sound";
import type { BeloteView } from "./types";

const TRUMP_ORDER = [11, 9, 14, 10, 13, 12, 8, 7];
const PLAIN_ORDER = [14, 10, 13, 12, 11, 9, 8, 7];

function sortHand(hand: Card[], trump: Suit | null): Card[] {
  const suits: Face[] = trump ? [trump, ...SUITS.filter((suit) => suit !== trump)] : [...SUITS];
  return [...hand].sort((a, b) => {
    const bySuit = suits.indexOf(a.s) - suits.indexOf(b.s);
    if (bySuit !== 0) return bySuit;
    const order = trump && a.s === trump ? TRUMP_ORDER : PLAIN_ORDER;
    return order.indexOf(a.r) - order.indexOf(b.r);
  });
}

export function BeloteTable({ view, send }: { view: BeloteView; send: (payload: object) => void }) {
  const seen = useRef<{ trick: number; result: string } | null>(null);
  useEffect(() => {
    const snap = { trick: view.trick.length, result: view.result?.summary ?? "" };
    const before = seen.current;
    seen.current = snap;
    if (!before) return;
    if (snap.result && snap.result !== before.result) playSound("win");
    else if (snap.trick !== before.trick) playSound("card");
  }, [view.trick.length, view.result]);

  const mine = view.you.seat;
  const order = [0, 1, 2, 3].map((step) => view.seats[(mine + step) % 4]!);
  const legalKey = new Set(view.legalCards.map((card) => cardKey(card)));
  const yourTurn = view.turnSeat === mine;
  const hand = sortHand(view.you.hand, view.trump);
  return (
    <section className="play belote-play" aria-label="Table de belote">
      <div className="felt-head">
        <span>{view.teams[0].names}</span>
        <strong>
          {view.scores[0]} – {view.scores[1]}
        </strong>
        <span>{view.teams[1].names}</span>
        <span>{view.trump ? `Atout ${suitFr(view.trump)} ${suitGlyph(view.trump)}` : "Prise en cours"}</span>
      </div>
      <div className="stage">
        <div className="rail">
          <div className="cushion">
            <div className="felt seats-4">
              <p className="watermark" aria-hidden="true">
                LF
              </p>
              <div className="center trick">
                {view.faceUp ? (
                  <div className="face-up">
                    <p>Retournée</p>
                    <PlayingCard card={view.faceUp} />
                  </div>
                ) : null}
                {view.trick.map((play) => (
                  <span key={`${play.seat}${play.card.r}${play.card.s}`} className={`trick-card play-s${(play.seat - mine + 4) % 4}`}>
                    <PlayingCard card={play.card} />
                  </span>
                ))}
                {view.knownTakerCard ? <p className="known">Carte connue du preneur : {cardFr(view.knownTakerCard)}</p> : null}
              </div>
              {order.map((seat, index) => (
                <article key={seat.id} className={`seat seat-i${index} ${seat.isTurn ? "turn" : ""}`}>
                  {index === 0 ? null : (
                    <div className="backs" aria-hidden="true">
                      {Array.from({ length: Math.min(seat.cards, 4) }, (_, cardIndex) => (
                        <PlayingCard key={cardIndex} hidden />
                      ))}
                    </div>
                  )}
                  <div className="plate">
                    <Avatar name={seat.nickname} />
                    <strong>{seat.nickname}</strong>
                    <span>
                      {seat.cards} cartes {seat.isDealer ? "· donneur" : ""} {seat.isTaker ? "· preneur" : ""}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
      {view.result ? (
        <p className="banner" role="status">
          {view.result.summary}
        </p>
      ) : null}
      {view.phase === "bidding1" && yourTurn ? (
        <div className="actions">
          <button type="button" className="btn-brass" onClick={() => send({ t: "action", action: { type: "take" } })}>
            Je prends à {view.faceUp ? suitFr(view.faceUp.s) : "l'atout"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => send({ t: "action", action: { type: "pass" } })}>
            Je passe
          </button>
        </div>
      ) : null}
      {view.phase === "bidding2" && yourTurn && view.faceUp ? (
        <div className="actions">
          {(["s", "h", "d", "c"] as const)
            .filter((suit) => suit !== view.faceUp!.s)
            .map((suit) => (
              <button key={suit} type="button" className="btn-brass" onClick={() => send({ t: "action", action: { type: "take", suit } })}>
                Prendre à {suitFr(suit)}
              </button>
            ))}
          <button type="button" className="btn-ghost" onClick={() => send({ t: "action", action: { type: "pass" } })}>
            Je passe
          </button>
        </div>
      ) : null}
      {view.phase === "play" || view.phase === "bidding1" || view.phase === "bidding2" ? (
        <div className="fan" data-count={hand.length}>
          {hand.map((card) => {
            const key = cardKey(card);
            const playable = view.phase === "play" && yourTurn && legalKey.has(key);
            return (
              <span key={key} className={playable ? "shell playable" : "shell"}>
                <PlayingCard
                  card={card}
                  dimmed={view.phase === "play" && !playable}
                  disabled={!playable}
                  onClick={playable ? () => send({ t: "action", action: { type: "play", card } }) : undefined}
                />
              </span>
            );
          })}
        </div>
      ) : (
        <button type="button" className="btn-brass" onClick={() => send({ t: "continue" })}>
          {view.phase === "match-over" ? "Rejouer" : "Donne suivante"}
        </button>
      )}
      {view.pending > 0 ? <p className="note">{view.pending} points de litige attendent la prochaine donne.</p> : null}
      <p className="turn-live" aria-live="polite">
        Objectif {view.target}. {yourTurn ? "C'est à vous." : "Au tour d'un autre joueur."}
      </p>
    </section>
  );
}
