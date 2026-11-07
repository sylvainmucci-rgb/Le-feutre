import { useState } from "react";
import { NOT_IN_THIS_VERSION, type GameId } from "../shared/games";
import { formatDollars, stakesForBuyIn, type HoldemBuyIn } from "../shared/poker/holdem";
import { PlayingCard } from "./cards";
import { ChipStack } from "./chips";
import { FictionalBanner } from "./disclaimer";

export function Home({
  nickname,
  setNickname,
  joinCode,
  setJoinCode,
  onCreate,
  onJoin,
}: {
  nickname: string;
  setNickname: (value: string) => void;
  joinCode: string;
  setJoinCode: (value: string) => void;
  onCreate: (game: GameId, stack?: number) => void;
  onJoin: () => void;
}) {
  const [buyIn, setBuyIn] = useState<HoldemBuyIn>(1000);
  return (
    <section className="home">
      <div className="hero-copy">
        <p className="eyebrow">Salon privé</p>
        <h1>Le Feutre</h1>
        <p className="lead">
          Une table ovale, un pseudonyme, un code secret. Belote classique et Texas Hold&apos;em entre amis. Aucun compte,
          aucun achat, aucune publicité.
        </p>
        <FictionalBanner />
      </div>
      <div className="mark" aria-hidden="true">
        <div className="mark-rail">
          <div className="mark-felt">
            <PlayingCard card={{ r: 14, s: "h" }} />
            <PlayingCard card={{ r: 13, s: "s" }} />
            <PlayingCard hidden />
          </div>
        </div>
      </div>
      <label htmlFor="nick">Votre pseudonyme à cette table</label>
      <input
        id="nick"
        value={nickname}
        maxLength={18}
        placeholder="Par exemple : Sylvain"
        autoComplete="nickname"
        onChange={(event) => setNickname(event.target.value)}
      />
      <div className="choices">
        <article className="invite">
          <p className="eyebrow">Poker</p>
          <h2>Texas Hold&apos;em</h2>
          <p>Deux à huit joueurs. Préflop, flop, turn, river. La meilleure main de cinq cartes.</p>
          <div className="preview" aria-hidden="true">
            <PlayingCard card={{ r: 14, s: "s" }} />
            <PlayingCard card={{ r: 14, s: "h" }} />
            <ChipStack cents={buyIn} />
          </div>
          <fieldset className="stakes">
            <legend>Tapis initial fictif, le même pour tout le monde</legend>
            {([200, 500, 1000] as const).map((amount) => {
              const stake = stakesForBuyIn(amount);
              return (
                <label key={amount} className={buyIn === amount ? "stake on" : "stake"}>
                  <input type="radio" name="buy-in" checked={buyIn === amount} onChange={() => setBuyIn(amount)} />
                  <span>
                    {formatDollars(amount)}
                    <small>
                      blinds {formatDollars(stake.sb)} / {formatDollars(stake.bb)}
                    </small>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <p className="note">Sans valeur réelle. Les blinds restent fixes pendant toute la partie.</p>
          <button type="button" className="btn-brass" onClick={() => onCreate("texas-holdem", buyIn)}>
            Créer une table Hold&apos;em
          </button>
        </article>
        <article className="invite">
          <p className="eyebrow">Plis</p>
          <h2>Belote classique</h2>
          <p>Quatre joueurs, deux équipes. Prise, atout, plis, belote et rebelote. Partie en 1{"\u00a0"}000 points.</p>
          <div className="preview" aria-hidden="true">
            <PlayingCard card={{ r: 11, s: "h" }} />
            <PlayingCard card={{ r: 9, s: "h" }} />
            <PlayingCard card={{ r: 14, s: "d" }} />
          </div>
          <button type="button" className="btn-brass" onClick={() => onCreate("belote")}>
            Créer une table de belote
          </button>
        </article>
      </div>
      <form
        className="join"
        onSubmit={(event) => {
          event.preventDefault();
          onJoin();
        }}
      >
        <label htmlFor="code">Vous avez un code ?</label>
        <input
          id="code"
          value={joinCode}
          placeholder="CODE"
          maxLength={8}
          autoCapitalize="characters"
          onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
        />
        <button type="submit" className="btn-brass">
          Rejoindre
        </button>
      </form>
      <p className="note quiet-note">Pas encore à cette table : {NOT_IN_THIS_VERSION.join(", ")}.</p>
    </section>
  );
}
