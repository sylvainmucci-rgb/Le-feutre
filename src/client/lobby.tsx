import { useState } from "react";
import { gameById } from "../shared/games";
import { formatDollars, stakesForBuyIn } from "../shared/poker/holdem";
import { Avatar } from "./avatar";
import { FictionalBanner } from "./disclaimer";
import type { TableView } from "./types";

export function Lobby({
  view,
  link,
  host,
  send,
  onCopied,
}: {
  view: TableView;
  link: string;
  host: boolean;
  send: (payload: object) => void;
  onCopied: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const rule = gameById(view.game);
  const needed = rule.min;
  const title = rule.name;
  return (
    <section className="lobby">
      <div className="stage">
        <div className="rail">
          <div className="cushion">
            <div className="felt lobby-felt" aria-label="Table en attente">
              <p className="watermark" aria-hidden="true">
                LF
              </p>
              <div className="center">
                <p className="eyebrow">{title}</p>
                <h1>Table {view.code}</h1>
                <p className="plaque">
                  Code secret · {view.players.length} place{view.players.length > 1 ? "s" : ""} prise{view.players.length > 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ul className="roster">
        {view.players.map((player) => (
          <li key={player.id}>
            <Avatar name={player.nickname} />
            <div>
              <strong>{player.nickname}</strong>
              <span>{player.isHost ? "Hôte" : player.isBot ? "Automate" : "Joueur"}</span>
              <span className={player.connected ? "present" : "away"}>{player.connected ? "Présent" : "Absent"}</span>
            </div>
            {host && player.isBot ? (
              <button type="button" className="btn-ghost tiny" onClick={() => send({ t: "remove-bot", playerId: player.id })}>
                Retirer
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="lead slim">Envoyez ce lien aux personnes qui jouent avec vous. Le code est le secret de la table.</p>
      <div className="share">
        <input readOnly value={link} aria-label="Lien de la table" />
        <button
          type="button"
          className="btn-brass"
          onClick={() => {
            navigator.clipboard
              ?.writeText(link)
              .then(() => {
                setCopied(true);
                onCopied();
              })
              .catch(() => undefined);
          }}
        >
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      {host ? (
        <div className="row">
          <button type="button" className="btn-ghost" onClick={() => send({ t: "add-bot" })}>
            Ajouter un automate
          </button>
          <button type="button" className="btn-ghost" onClick={() => send({ t: "fill-bots" })}>
            Remplir la table
          </button>
          <button type="button" className="btn-brass" disabled={view.players.length < needed} onClick={() => send({ t: "start" })}>
            Lancer la partie
          </button>
        </div>
      ) : (
        <p>L&apos;hôte lance la partie quand la table est prête.</p>
      )}
      {view.buyIn ? (
        <p className="note">
          Chaque participant reçoit {formatDollars(view.buyIn)}. Blinds {formatDollars(stakesForBuyIn(view.buyIn).sb)} /{" "}
          {formatDollars(stakesForBuyIn(view.buyIn).bb)}. Dollars fictifs, sans paiement.
        </p>
      ) : null}
      <p className="note">
        Un automate joue de façon simple et ne voit que ses propres cartes. Il sert à essayer seul. Il faut {needed} joueurs au
        minimum.
      </p>
      <FictionalBanner compact />
    </section>
  );
}
