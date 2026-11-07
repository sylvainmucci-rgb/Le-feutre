import { duelLabel, type Book } from "../shared/book";

export function Classement({ book }: { book: Book }) {
  return (
    <section className="classement">
      <p className="eyebrow">Entre amis</p>
      <h1>Classement</h1>
      <p className="lead">
        Les victoires et les duels restent dans ce navigateur, au nom de votre pseudo. Quand vous revenez, ils sont renvoyés
        à la table pour reconstruire le salon après une mise en veille. Aucun gain réel.
      </p>
      <div className="board-grid">
        <article className="invite">
          <h2>Victoires</h2>
          {book.ranking.length === 0 ? <p className="note">Encore personne au tableau. Jouez une partie.</p> : null}
          <ol className="rank-list">
            {book.ranking.map((line, index) => (
              <li key={line.nickname}>
                <span className="rank">{index + 1}</span>
                <strong>{line.nickname}</strong>
                <span>{line.victories} victoire{line.victories > 1 ? "s" : ""}</span>
              </li>
            ))}
          </ol>
        </article>
        <article className="invite">
          <h2>Duels</h2>
          {book.duels.length === 0 ? <p className="note">Aucun duel pour l'instant.</p> : null}
          <ul className="duel-list">
            {book.duels.map((duel) => (
              <li key={`${duel.left}|${duel.right}`}>{duelLabel(duel)}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
