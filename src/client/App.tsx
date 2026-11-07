import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "../shared/chat";
import { cardFr, suitFr, suitGlyph, type Card, type Suit } from "../shared/cards";
import type { GameId } from "../shared/games";
import { formatDollars, stakesForBuyIn, type HoldemBuyIn } from "../shared/poker/holdem";
import { NOT_IN_THIS_VERSION } from "../shared/games";
import { ChatPanel } from "./chat";
import { PlayingCard } from "./cards";

type PlayerChip = {
  id: string;
  nickname: string;
  isBot: boolean;
  connected: boolean;
  isHost: boolean;
};

type PokerLegal = {
  fold: boolean;
  check: boolean;
  call: number | null;
  raise: { minTo: number; maxTo: number; short: boolean } | null;
};

type PokerSeat = {
  id: string;
  nickname: string;
  stack: number;
  streetBet: number;
  folded: boolean;
  allIn: boolean;
  isBot: boolean;
  hole: [Card, Card] | null;
  isButton: boolean;
  isTurn: boolean;
};

type PokerView = {
  kind: "texas-holdem";
  phase: "betting" | "between" | "match-over";
  street: string;
  board: Card[];
  pot: number;
  handNo: number;
  sb: number;
  bb: number;
  toActId: string | null;
  you: {
    id: string;
    hole: [Card, Card] | null;
    stack: number;
    toCall: number;
    legal: PokerLegal | null;
  };
  seats: PokerSeat[];
  result: { summary: string; revealed: { playerId: string; rank: string }[] } | null;
  log: string[];
};

type BeloteSeat = {
  id: string;
  nickname: string;
  seat: number;
  cards: number;
  isBot: boolean;
  isDealer: boolean;
  isTurn: boolean;
  isTaker: boolean;
};

type BeloteView = {
  kind: "belote";
  phase: "bidding1" | "bidding2" | "play" | "scoring" | "match-over";
  trump: Suit | null;
  faceUp: Card | null;
  knownTakerCard: Card | null;
  takerSeat: number | null;
  trick: { seat: number; card: Card }[];
  scores: [number, number];
  pending: number;
  target: number;
  teams: [{ names: string }, { names: string }];
  you: { id: string; seat: number; team: 0 | 1; hand: Card[] };
  seats: BeloteSeat[];
  legalCards: Card[];
  result: { summary: string; outcome: string } | null;
  log: string[];
  turnSeat: number | null;
};

type TableView = {
  code: string;
  game: GameId;
  status: "lobby" | "playing";
  hostId: string;
  youId: string;
  target: number;
  buyIn: HoldemBuyIn | null;
  players: PlayerChip[];
  chat: ChatMessage[];
  engine: PokerView | BeloteView | null;
};

type ServerMsg =
  | { t: "welcome"; code: string; token: string; playerId: string; view: TableView }
  | { t: "state"; view: TableView }
  | { t: "error"; message: string; fatal?: boolean }
  | { t: "pong" }
  | { t: "left" };

const STREETS: Record<string, string> = {
  preflop: "Préflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
};

function sessionKey(code: string) {
  return `feutre:${code}`;
}

export function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [nickname, setNickname] = useState(localStorage.getItem("feutre.nick") || "");
  const [joinCode, setJoinCode] = useState("");
  const [view, setView] = useState<TableView | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "reconnecting">("idle");
  const [error, setError] = useState("");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [panel, setPanel] = useState<"table" | "history" | "chat">("table");
  const socketRef = useRef<WebSocket | null>(null);
  const codeRef = useRef("");

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const tableCode = path.startsWith("/table/") ? decodeURIComponent(path.slice(7)).toUpperCase() : "";

  useEffect(() => {
    const initial = window.location.pathname.startsWith("/table/")
      ? decodeURIComponent(window.location.pathname.slice(7)).toUpperCase()
      : "";
    if (!initial) return;
    const saved = localStorage.getItem(sessionKey(initial));
    if (!saved) return;
    const session = JSON.parse(saved) as { token: string };
    openSocket({ t: "reconnect", code: initial, token: session.token });
    return () => {
      const current = socketRef.current;
      socketRef.current = null;
      current?.close();
    };
    // Ouverture unique si la page est rechargée sur une table déjà connue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(next: string) {
    window.history.pushState({}, "", next);
    setPath(next);
  }

  function openSocket(first: object) {
    const previous = socketRef.current;
    setStatus("connecting");
    setError("");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    socketRef.current = ws;
    previous?.close();
    let attempt = 0;
    let closedByUs = false;
    ws.onopen = () => {
      attempt = 0;
      setStatus("live");
      ws.send(JSON.stringify(first));
    };
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as ServerMsg;
      if (message.t === "pong" || message.t === "left") {
        if (message.t === "left") {
          closedByUs = true;
          setView(null);
          go("/");
        }
        return;
      }
      if (message.t === "error") {
        setError(message.message);
        if (message.fatal) setStatus("idle");
        return;
      }
      if (message.t === "welcome") {
        codeRef.current = message.code;
        localStorage.setItem(
          sessionKey(message.code),
          JSON.stringify({ token: message.token, playerId: message.playerId }),
        );
        localStorage.setItem(
          "feutre.nick",
          message.view.players.find((player) => player.id === message.playerId)?.nickname || nickname,
        );
        setView(message.view);
        setStatus("live");
        if (window.location.pathname !== `/table/${message.code}`) go(`/table/${message.code}`);
        return;
      }
      setView(message.view);
      setStatus("live");
    };
    ws.onclose = () => {
      if (socketRef.current !== ws) return;
      setSocket(null);
      if (closedByUs) return;
      setStatus("reconnecting");
      const delay = Math.min(10_000, 500 * 2 ** attempt);
      attempt += 1;
      window.setTimeout(() => {
        if (socketRef.current !== ws) return;
        const code = codeRef.current;
        const saved = code ? localStorage.getItem(sessionKey(code)) : null;
        if (!saved) {
          setStatus("idle");
          return;
        }
        const session = JSON.parse(saved) as { token: string };
        openSocket({ t: "reconnect", code, token: session.token });
      }, delay);
    };
    setSocket(ws);
  }

  function send(payload: object) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("Connexion interrompue. Nouvelle tentative en cours.");
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: "ping" }));
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [socket]);

  const link = view ? `${location.origin}/table/${view.code}` : "";

  return (
    <>
      <a className="skip" href="#contenu">
        Aller au contenu
      </a>
      <header className="top">
        <button type="button" className="brand" onClick={() => go("/")}>
          Le Feutre
        </button>
        <p>Cartes entre amis, sans argent réel</p>
        <span className={`dot ${status}`}>{status === "live" ? "En ligne" : status === "reconnecting" ? "Reconnexion" : status === "connecting" ? "Connexion" : "Prêt"}</span>
      </header>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      <main id="contenu">
        {!view && !tableCode ? (
          <Home
            nickname={nickname}
            setNickname={setNickname}
            joinCode={joinCode}
            setJoinCode={setJoinCode}
            onCreate={(game, stack) => {
              localStorage.setItem("feutre.nick", nickname.trim());
              openSocket({ t: "create", game, nickname: nickname.trim() || "Invité", stack });
            }}
            onJoin={() => {
              const code = joinCode.trim().toUpperCase();
              if (code.length < 4) {
                setError("Indiquez le code de la table.");
                return;
              }
              localStorage.setItem("feutre.nick", nickname.trim());
              go(`/table/${code}`);
              openSocket({ t: "join", code, nickname: nickname.trim() || "Invité" });
            }}
          />
        ) : null}
        {!view && tableCode ? (
          <section className="panel narrow">
            <h1>Rejoindre {tableCode}</h1>
            <label htmlFor="nick-join">Votre pseudonyme</label>
            <input id="nick-join" value={nickname} maxLength={18} onChange={(event) => setNickname(event.target.value)} />
            <button
              type="button"
              className="primary"
              onClick={() => openSocket({ t: "join", code: tableCode, nickname: nickname.trim() || "Invité" })}
            >
              Entrer à la table
            </button>
          </section>
        ) : null}
        {view ? (
          <TableRoom
            view={view}
            link={link}
            panel={panel}
            setPanel={setPanel}
            send={send}
            onCopied={() => setError("")}
          />
        ) : null}
      </main>
    </>
  );
}

function Home({
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
      <p className="eyebrow">La table de Sylvain</p>
      <h1>Posez les cartes. Gardez les amis.</h1>
      <p className="lead">
        Belote classique et Texas Hold'em, à plusieurs, sur un lien privé. Aucun compte, aucun achat, aucune publicité.
        Les dollars du Hold'em sont fictifs : aucun paiement, aucun retrait.
      </p>
      <label htmlFor="nick">Pseudonyme à cette table</label>
      <input
        id="nick"
        value={nickname}
        maxLength={18}
        placeholder="Par exemple : Sylvain"
        onChange={(event) => setNickname(event.target.value)}
      />
      <div className="choices">
        <article>
          <h2>Texas Hold'em</h2>
          <p>2 à 8 joueurs. Préflop, flop, turn, river. Dollars fictifs seulement.</p>
          <fieldset className="stakes">
            <legend>Tapis initial, le même pour tout le monde</legend>
            {([200, 500, 1000] as const).map((amount) => {
              const stake = stakesForBuyIn(amount);
              return (
                <label key={amount}>
                  <input
                    type="radio"
                    name="buy-in"
                    checked={buyIn === amount}
                    onChange={() => setBuyIn(amount)}
                  />
                  {formatDollars(amount)} · blinds {formatDollars(stake.sb)} / {formatDollars(stake.bb)}
                </label>
              );
            })}
          </fieldset>
          <p className="note">Sans valeur réelle. Les blinds ne doublent pas pendant la partie.</p>
          <button type="button" className="primary" onClick={() => onCreate("texas-holdem", buyIn)}>
            Créer une table Hold'em
          </button>
        </article>
        <article>
          <h2>Belote classique</h2>
          <p>4 joueurs, deux équipes. Prise, atout, plis, belote et rebelote. Partie en 1&nbsp;000 points.</p>
          <button type="button" className="primary" onClick={() => onCreate("belote")}>
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
          onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
        />
        <button type="submit">Rejoindre</button>
      </form>
      <p className="note">
        Pas dans cette version : {NOT_IN_THIS_VERSION.join(", ")}. Ce prototype tourne ici ; il n'est pas publié sur Internet.
      </p>
    </section>
  );
}

function TableRoom({
  view,
  link,
  panel,
  setPanel,
  send,
  onCopied,
}: {
  view: TableView;
  link: string;
  panel: "table" | "history" | "chat";
  setPanel: (panel: "table" | "history" | "chat") => void;
  send: (payload: object) => void;
  onCopied: () => void;
}) {
  const me = view.players.find((player) => player.id === view.youId);
  const host = me?.isHost;
  const log = view.engine?.log ?? [];
  return (
    <section className={`room ${panel}`}>
      <div className="table-wrap">
        {view.status === "lobby" ? (
          <Lobby view={view} link={link} host={Boolean(host)} send={send} onCopied={onCopied} />
        ) : view.engine?.kind === "texas-holdem" ? (
          <PokerTable view={view.engine} send={send} youId={view.youId} />
        ) : view.engine?.kind === "belote" ? (
          <BeloteTable view={view.engine} send={send} />
        ) : null}
      </div>
      <aside className="side">
        <div className="tabs">
          <button type="button" aria-pressed={panel === "table"} onClick={() => setPanel("table")}>
            Table
          </button>
          <button type="button" aria-pressed={panel === "history"} onClick={() => setPanel("history")}>
            Historique
          </button>
          <button type="button" aria-pressed={panel === "chat"} onClick={() => setPanel("chat")}>
            Discussion
          </button>
        </div>
        <section className="history" aria-label="Historique des coups">
          <h2>Coups</h2>
          <ol>
            {log.length === 0 ? <li>En attente du premier coup.</li> : log.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
          </ol>
        </section>
        <ChatPanel messages={view.chat} youId={view.youId} onSend={(text) => send({ t: "chat", text })} />
        <button type="button" className="quiet" onClick={() => send({ t: "leave" })}>
          Quitter la table
        </button>
      </aside>
    </section>
  );
}

function Lobby({
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
  const needed = view.game === "belote" ? 4 : 2;
  return (
    <section className="lobby">
      <p className="eyebrow">{view.game === "belote" ? "Belote classique" : "Texas Hold'em"}</p>
      <h1>Table {view.code}</h1>
      <p>Envoyez ce lien aux personnes qui jouent avec vous. Le code est le secret de la table.</p>
      <div className="share">
        <input readOnly value={link} aria-label="Lien de la table" />
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(link).then(onCopied).catch(() => undefined);
          }}
        >
          Copier
        </button>
      </div>
      <ul className="seats">
        {view.players.map((player) => (
          <li key={player.id}>
            <strong>{player.nickname}</strong>
            <span>{player.isHost ? "Hôte" : player.isBot ? "Automate" : "Joueur"}</span>
            <span>{player.connected ? "Présent" : "Déconnecté"}</span>
            {host && player.isBot ? (
              <button type="button" onClick={() => send({ t: "remove-bot", playerId: player.id })}>
                Retirer
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {host ? (
        <div className="row">
          <button type="button" onClick={() => send({ t: "add-bot" })}>
            Ajouter un automate
          </button>
          <button type="button" onClick={() => send({ t: "fill-bots" })}>
            Remplir la table
          </button>
          <button type="button" className="primary" disabled={view.players.length < needed} onClick={() => send({ t: "start" })}>
            Lancer la partie
          </button>
        </div>
      ) : (
        <p>L'hôte lance la partie quand la table est prête.</p>
      )}
      {view.buyIn ? (
        <p className="note">
          Chaque participant reçoit {formatDollars(view.buyIn)}. Blinds {formatDollars(stakesForBuyIn(view.buyIn).sb)} /{" "}
          {formatDollars(stakesForBuyIn(view.buyIn).bb)}. Dollars fictifs, sans paiement.
        </p>
      ) : null}
      <p className="note">
        Un automate joue de façon simple et ne reçoit que ses propres cartes. Il sert à essayer seul. Il faut {needed} joueurs
        au minimum.
      </p>
    </section>
  );
}

function PokerTable({ view, send, youId }: { view: PokerView; send: (payload: object) => void; youId: string }) {
  const [amount, setAmount] = useState(view.you.legal?.raise?.minTo ?? view.bb);
  useEffect(() => {
    if (view.you.legal?.raise) setAmount(view.you.legal.raise.minTo);
  }, [view.you.legal?.raise?.minTo, view.handNo, view.street]);
  const hero = view.seats.findIndex((seat) => seat.id === youId);
  const ordered = useMemo(() => {
    if (hero < 0) return view.seats;
    return view.seats.map((_, index) => view.seats[(hero + index) % view.seats.length]!);
  }, [view.seats, hero]);
  const legal = view.you.legal;
  return (
    <section className="felt" aria-label="Table de Hold'em">
      <div className="felt-head">
        <span>Donne {view.handNo}</span>
        <span>{STREETS[view.street] ?? view.street}</span>
        <strong>Pot {formatDollars(view.pot)}</strong>
        <span>
          Blinds {formatDollars(view.sb)}/{formatDollars(view.bb)}
        </span>
      </div>
      <div className="orbit">
        {ordered.map((seat, index) => (
          <SeatChip key={seat.id} seat={seat} index={index} total={ordered.length} />
        ))}
        <div className="board">
          {view.board.length === 0 ? <p>Cartes communes à venir</p> : view.board.map((card) => <PlayingCard key={`${card.r}${card.s}`} card={card} />)}
        </div>
      </div>
      <div className="hero">
        <div className="holes">
          {view.you.hole ? view.you.hole.map((card) => <PlayingCard key={`${card.r}${card.s}`} card={card} />) : <PlayingCard hidden />}
        </div>
        <p>
          Dollars fictifs : <strong>{formatDollars(view.you.stack)}</strong>
          {view.toActId === youId ? " · À vous" : ""}
        </p>
      </div>
      {view.result ? (
        <p className="banner">{view.result.summary} Ces dollars n'ont aucune valeur réelle.</p>
      ) : (
        <p className="note">Dollars fictifs, sans paiement.</p>
      )}
      {legal ? (
        <div className="actions">
          {legal.fold ? (
            <button type="button" onClick={() => send({ t: "action", action: { type: "fold" } })}>
              Se coucher
            </button>
          ) : null}
          {legal.check ? (
            <button type="button" className="primary" onClick={() => send({ t: "action", action: { type: "check" } })}>
              Parole
            </button>
          ) : null}
          {legal.call !== null ? (
            <button type="button" className="primary" onClick={() => send({ t: "action", action: { type: "call" } })}>
              Suivre {formatDollars(legal.call)}
            </button>
          ) : null}
          {legal.raise ? (
            <>
              <label htmlFor="bet">
                {currentBetLabel(view)} {formatDollars(amount)}
              </label>
              <input
                id="bet"
                type="range"
                min={legal.raise.minTo}
                max={legal.raise.maxTo}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
              <button type="button" onClick={() => send({ t: "action", action: { type: "bet", amount } })}>
                {legal.raise.short ? `Tapis ${formatDollars(amount)}` : view.street === "preflop" || view.pot > 0 ? `Relancer à ${formatDollars(amount)}` : `Miser ${formatDollars(amount)}`}
              </button>
            </>
          ) : null}
        </div>
      ) : view.phase !== "betting" ? (
        <button type="button" className="primary" onClick={() => send({ t: "continue" })}>
          {view.phase === "match-over" ? "Rejouer" : "Donne suivante"}
        </button>
      ) : (
        <p className="wait">En attente d'un autre joueur.</p>
      )}
    </section>
  );
}

function currentBetLabel(view: PokerView) {
  return view.you.toCall > 0 ? "Relance à" : "Mise";
}

function SeatChip({ seat, index, total }: { seat: PokerSeat; index: number; total: number }) {
  const theta = Math.PI / 2 + (index / total) * Math.PI * 2;
  const style = {
    left: `${50 + 38 * Math.cos(theta)}%`,
    top: `${46 + 34 * Math.sin(theta)}%`,
  };
  return (
    <article className={`seat ${seat.isTurn ? "turn" : ""} ${seat.folded ? "folded" : ""}`} style={style}>
      <strong>{seat.nickname}</strong>
      <span>{formatDollars(seat.stack)}</span>
      {seat.streetBet > 0 ? <span>mise {formatDollars(seat.streetBet)}</span> : null}
      <span className="tags">
        {seat.isButton ? "Bouton" : ""} {seat.allIn ? "Tapis" : ""} {seat.folded ? "Couché" : ""}
      </span>
      {index === 0 ? null : (
        <div className="mini">
          {seat.hole ? (
            seat.hole.map((card) => <PlayingCard key={`${card.r}${card.s}${seat.id}`} card={card} />)
          ) : (
            <>
              <PlayingCard hidden />
              <PlayingCard hidden />
            </>
          )}
        </div>
      )}
    </article>
  );
}

function BeloteTable({ view, send }: { view: BeloteView; send: (payload: object) => void }) {
  const mine = view.you.seat;
  const order = [0, 1, 2, 3].map((step) => view.seats[(mine + step) % 4]!);
  const legalKey = new Set(view.legalCards.map((card) => `${card.r}${card.s}`));
  const yourTurn = view.turnSeat === mine;
  return (
    <section className="felt belote" aria-label="Table de belote">
      <div className="felt-head">
        <span>{view.teams[0].names}</span>
        <strong>
          {view.scores[0]} – {view.scores[1]}
        </strong>
        <span>{view.teams[1].names}</span>
        <span>{view.trump ? `Atout ${suitFr(view.trump)} ${suitGlyph(view.trump)}` : "Prise en cours"}</span>
      </div>
      <div className="cross">
        {order.map((seat) => (
          <article key={seat.id} className={`belote-seat s${(seat.seat - mine + 4) % 4} ${seat.isTurn ? "turn" : ""}`}>
            <strong>{seat.nickname}</strong>
            <span>
              {seat.cards} cartes {seat.isDealer ? "· donneur" : ""} {seat.isTaker ? "· preneur" : ""}
            </span>
          </article>
        ))}
        <div className="trick">
          {view.faceUp ? (
            <div>
              <p>Retournée</p>
              <PlayingCard card={view.faceUp} />
            </div>
          ) : null}
          {view.trick.map((play) => (
            <PlayingCard key={`${play.seat}${play.card.r}${play.card.s}`} card={play.card} />
          ))}
          {view.knownTakerCard ? <p className="known">Carte connue du preneur : {cardFr(view.knownTakerCard)}</p> : null}
        </div>
      </div>
      {view.result ? <p className="banner">{view.result.summary}</p> : null}
      {view.phase === "bidding1" && yourTurn ? (
        <div className="actions">
          <button type="button" className="primary" onClick={() => send({ t: "action", action: { type: "take" } })}>
            Je prends à {view.faceUp ? suitFr(view.faceUp.s) : "l'atout"}
          </button>
          <button type="button" onClick={() => send({ t: "action", action: { type: "pass" } })}>
            Je passe
          </button>
        </div>
      ) : null}
      {view.phase === "bidding2" && yourTurn && view.faceUp ? (
        <div className="actions">
          {(["s", "h", "d", "c"] as const)
            .filter((suit) => suit !== view.faceUp!.s)
            .map((suit) => (
              <button key={suit} type="button" className="primary" onClick={() => send({ t: "action", action: { type: "take", suit } })}>
                Prendre à {suitFr(suit)}
              </button>
            ))}
          <button type="button" onClick={() => send({ t: "action", action: { type: "pass" } })}>
            Je passe
          </button>
        </div>
      ) : null}
      {view.phase === "play" ? (
        <div className="hand">
          {view.you.hand.map((card) => {
            const key = `${card.r}${card.s}`;
            const playable = yourTurn && legalKey.has(key);
            return (
              <PlayingCard
                key={key}
                card={card}
                dimmed={!playable}
                disabled={!playable}
                onClick={playable ? () => send({ t: "action", action: { type: "play", card } }) : undefined}
              />
            );
          })}
        </div>
      ) : view.phase === "bidding1" || view.phase === "bidding2" ? (
        <div className="hand">
          {view.you.hand.map((card) => (
            <PlayingCard key={`${card.r}${card.s}`} card={card} />
          ))}
        </div>
      ) : (
        <button type="button" className="primary" onClick={() => send({ t: "continue" })}>
          {view.phase === "match-over" ? "Rejouer" : "Donne suivante"}
        </button>
      )}
      {view.pending > 0 ? <p className="note">{view.pending} points de litige attendent la prochaine donne.</p> : null}
      <p className="wait">Objectif {view.target}. {yourTurn ? "C'est à vous." : "Au tour d'un autre joueur."}</p>
    </section>
  );
}
