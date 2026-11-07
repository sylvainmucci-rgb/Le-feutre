import { useEffect, useRef, useState } from "react";
import { cardKey, type Card } from "../shared/cards";
import { gameById, type GameId } from "../shared/games";
import { Avatar } from "./avatar";
import { Trinket, usePerson } from "./look";
import { PlayingCard } from "./cards";
import { playSound } from "./sound";
import type { TrickScene } from "./types";

function TrickSeat({ seat, index }: { seat: TrickScene["seats"][number]; index: number }) {
  const person = usePerson(seat.id);
  return (
    <article className={`seat seat-i${index} ${seat.isTurn ? "turn" : ""}`}>
      {index === 0 ? null : (
        <div className="backs" aria-hidden="true">
          {Array.from({ length: Math.min(seat.cards, 3) }, (_, cardIndex) => (
            <PlayingCard key={cardIndex} hidden />
          ))}
        </div>
      )}
      <div className="plate">
        <Trinket id={person?.trinket} />
        <Avatar name={seat.nickname} reaction={person?.reaction} timing={seat.isTurn} />
        <strong>{seat.nickname}</strong>
        <span>
          {seat.cards} cartes {seat.tags}
        </span>
      </div>
    </article>
  );
}

export function TrickTable({ view, send }: { view: TrickScene; send: (payload: object) => void }) {
  const seen = useRef<{ trick: number; result: string } | null>(null);
  const [picked, setPicked] = useState<Card[]>([]);
  const [played, setPlayed] = useState("");
  useEffect(() => {
    const snap = { trick: view.trick.length, result: view.result?.summary ?? "" };
    const before = seen.current;
    seen.current = snap;
    if (!before) return;
    if (snap.result && snap.result !== before.result) playSound("win");
    else if (snap.trick !== before.trick) playSound("card");
  }, [view.trick.length, view.result]);
  const mine = view.you.seat;
  const count = Math.max(2, view.seats.length);
  const ordered = view.seats.map((_, index) => view.seats[(mine + index) % view.seats.length]!);
  const legal = new Set(view.legalCards.map(cardKey));
  const naming = view.naming ?? "poker";
  const discarding = Boolean(view.discard) || (view.discardCount ?? 0) > 0;
  const yourTurn = view.seats[mine]?.isTurn;
  useEffect(() => setPlayed(""), [view.you.hand, view.trick.length]);
  return (
    <section className="play" aria-label={gameById(view.kind as GameId).name}>
      <div className="felt-head">
        <span>{view.trumpLabel}</span>
        <strong>{view.scores}</strong>
        {view.teams ? <span>{view.teams.join(" · ")}</span> : null}
      </div>
      <div className="stage">
        <div className="rail">
          <div className="cushion">
            <div className={`felt seats-${Math.min(8, count)}`}>
              <p className="watermark" aria-hidden="true">
                LF
              </p>
              <div className="center trick">
                {view.faceUp ? (
                  <div className="face-up">
                    <p>Retournée</p>
                    <PlayingCard card={view.faceUp} naming={naming} />
                  </div>
                ) : null}
                {(view.dog ?? []).map((card) => (
                  <PlayingCard key={`dog${cardKey(card)}`} card={card} naming={naming} />
                ))}
                {view.trick.map((play) => (
                  <span key={`${play.seat}${cardKey(play.card)}`} className={`trick-card play-s${(play.seat - mine + count) % count}`}>
                    <PlayingCard card={play.card} naming={naming} />
                  </span>
                ))}
              </div>
              {ordered.map((seat, index) => (
                <TrickSeat key={seat.id} seat={seat} index={index} />
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
      {view.prompts.length > 0 ? (
        <div className="actions">
          {view.prompts.map((prompt) => (
            <button key={prompt.label} type="button" className="btn-brass" onClick={() => send({ t: "action", action: prompt.action })}>
              {prompt.label}
            </button>
          ))}
        </div>
      ) : null}
      {discarding && yourTurn ? (
        <div className="actions">
          <button
            type="button"
            className="btn-brass"
            onClick={() => send({ t: "action", action: { type: "discard", cards: picked } })}
          >
            {view.discardCount ? `Écarter ${picked.length}/${view.discardCount}` : `Échanger ${picked.length}`}
          </button>
        </div>
      ) : null}
      <div className="fan" data-count={Math.min(8, view.you.hand.length)}>
        {view.you.hand.filter((card) => cardKey(card) !== played).map((card) => {
          const key = cardKey(card);
          const playable = !discarding && yourTurn && legal.has(key);
          const marked = picked.some((item) => cardKey(item) === key);
          return (
            <span key={key} className={playable || marked ? "shell playable" : "shell"}>
              <PlayingCard
                card={card}
                naming={naming}
                dimmed={(!playable && !discarding && view.legalCards.length > 0) || marked}
                onClick={
                  playable
                    ? () => {
                        setPlayed(key);
                        send({
                          t: "action",
                          action: view.kind === "ecarte" ? { type: "play-card", card } : { type: "play", card },
                        });
                      }
                    : discarding && yourTurn
                      ? () =>
                          setPicked((current) =>
                            current.some((item) => cardKey(item) === key) ? current.filter((item) => cardKey(item) !== key) : [...current, card],
                          )
                      : undefined
                }
              />
            </span>
          );
        })}
      </div>
      {view.phase === "scoring" || view.phase === "match-over" ? (
        <button type="button" className="btn-brass" onClick={() => send({ t: "continue" })}>
          {view.phase === "match-over" ? "Rejouer" : "Donne suivante"}
        </button>
      ) : null}
      <p className="turn-live" aria-live="polite">
        {yourTurn ? "C'est à vous." : "Au tour d'un autre joueur."}
      </p>
    </section>
  );
}
