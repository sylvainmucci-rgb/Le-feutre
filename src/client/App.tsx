import { useEffect, useRef, useState } from "react";
import type { GameId } from "../shared/games";
import { FictionalBanner } from "./disclaimer";
import { Home } from "./home";
import { FullscreenButton, SoundButton, TableRoom } from "./room";
import { installSoundUnlock } from "./sound";
import type { ServerMsg, TableView } from "./types";

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

  useEffect(() => installSoundUnlock(), []);

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
  const statusLabel =
    status === "live" ? "En ligne" : status === "reconnecting" ? "Reconnexion" : status === "connecting" ? "Connexion" : "Prêt";

  return (
    <div className="salon">
      <a className="skip" href="#contenu">
        Aller au contenu
      </a>
      <header className="topbar">
        <div className="brand-lockup">
          <button type="button" className="brand" onClick={() => go("/")}>
            Le Feutre
          </button>
          <p>Cartes entre amis, sans argent réel</p>
        </div>
        <div className="top-actions">
          <SoundButton />
          <FullscreenButton />
          <span className={`dot ${status}`}>{statusLabel}</span>
        </div>
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
            <p className="eyebrow">Table privée</p>
            <h1>Rejoindre {tableCode}</h1>
            <label htmlFor="nick-join">Votre pseudonyme</label>
            <input id="nick-join" value={nickname} maxLength={18} onChange={(event) => setNickname(event.target.value)} />
            <button
              type="button"
              className="btn-brass"
              onClick={() => openSocket({ t: "join", code: tableCode, nickname: nickname.trim() || "Invité" })}
            >
              Entrer à la table
            </button>
            <FictionalBanner compact />
          </section>
        ) : null}
        {view ? (
          <TableRoom view={view} link={link} panel={panel} setPanel={setPanel} send={send} onCopied={() => setError("")} />
        ) : null}
      </main>
      <footer className="legal">Les dollars et jetons de cette table sont fictifs et n&apos;ont aucune valeur réelle.</footer>
    </div>
  );
}

export type { GameId };
