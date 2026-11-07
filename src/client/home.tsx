import { useEffect, useState } from "react";
import { PLAYABLE_GAMES, type GameId } from "../shared/games";
import { formatDollars, stakesForBuyIn, type HoldemBuyIn } from "../shared/poker/holdem";
import { PlayingCard } from "./cards";
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
  const [board, setBoard] = useState<{ note: string; ranking: { nickname: string; victories: number }[]; duels: { left: string; right: string; leftWins: number; rightWins: number }[] } | null>(null);
  useEffect(() => {
    let gone = false;
    fetch("/palmares")
      .then((response) => response.json())
      .then((data) => {
        if (!gone) setBoard(data);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, []);
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
      <section className="stakes-block">
        <h2>Tapis fictif des pokers</h2>
        <fieldset className="stakes">
          <legend>Le même montant pour tout le monde. Trois recaves au plus, puis élimination.</legend>
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
        <p className="note">Dollars sans valeur réelle. Les blinds ne doublent pas. Hold&apos;em no-limit, Omaha pot-limit.</p>
      </section>
      {(["Poker", "Plis", "Table", "Soirée"] as const).map((group) => (
        <section key={group}>
          <h2>{group}</h2>
          <div className="choices">
            {PLAYABLE_GAMES.filter((game) => game.group === group).map((game) => (
              <article key={game.id} className="invite">
                <p className="eyebrow">{game.players} joueurs</p>
                <h2>{game.name}</h2>
                <p>{game.summary}</p>
                <button type="button" className="btn-brass" onClick={() => onCreate(game.id, game.stack ? buyIn : undefined)}>
                  Créer une table
                </button>
              </article>
            ))}
          </div>
        </section>
      ))}
      {board && (board.ranking.length > 0 || board.duels.length > 0) ? (
        <section className="invite">
          <h2>Palmarès</h2>
          <p className="note">{board.note}</p>
          {board.ranking.length > 0 ? (
            <ol className="ranking">
              {board.ranking.map((row) => (
                <li key={row.nickname}>
                  {row.nickname} · {row.victories}
                </li>
              ))}
            </ol>
          ) : null}
          {board.duels.length > 0 ? (
            <ul className="ranking">
              {board.duels.map((duel) => (
                <li key={`${duel.left}-${duel.right}`}>
                  {duel.left} {duel.leftWins}–{duel.rightWins} {duel.right}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
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
      <p className="note quiet-note">
        Poignées et chelem du tarot, sans-atout et tout-atout de la coinche ne sont pas comptés. La bataille se joue en donnes
        courtes, pas jusqu&apos;à épuisement du paquet.
      </p>
    </section>
  );
}
