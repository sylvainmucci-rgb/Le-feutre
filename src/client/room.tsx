import { useEffect, useState } from "react";
import { ChatPanel } from "./chat";
import { BeloteTable } from "./belote-table";
import { Lobby } from "./lobby";
import { PokerTable } from "./poker-table";
import { EveningTable, type EveningView } from "./evening-table";
import { TrickTable } from "./trick-table";
import type { EngineView, PokerKind, PokerView, TrickScene } from "./types";
import { playSound, setSoundOn, soundOn, subscribeSound } from "./sound";
import type { TableView } from "./types";

const POKER: readonly PokerKind[] = ["texas-holdem", "omaha", "stud", "draw"];
const TRICKS = ["coinche", "manille", "ecarte", "bataille", "tarot"] as const;
const EVENING = ["loto", "roulette", "blackjack"] as const;

function isPoker(kind: string): kind is PokerKind {
  return (POKER as readonly string[]).includes(kind);
}

function isPokerView(engine: EngineView): engine is PokerView {
  return isPoker(engine.kind);
}

function isTrick(kind: string): kind is TrickScene["kind"] {
  return (TRICKS as readonly string[]).includes(kind);
}

function isTrickView(engine: EngineView): engine is TrickScene {
  return isTrick(engine.kind);
}

function isEveningView(engine: EngineView): engine is EveningView {
  return (EVENING as readonly string[]).includes(engine.kind);
}

export function SoundButton() {
  const [on, setOn] = useState(soundOn);
  useEffect(() => subscribeSound(() => setOn(soundOn())), []);
  return (
    <button
      type="button"
      className="btn-ghost tiny"
      aria-pressed={on}
      onClick={() => {
        const next = !on;
        setSoundOn(next);
        if (next) playSound("click");
      }}
    >
      {on ? "Sons : oui" : "Sons : non"}
    </button>
  );
}

export function FullscreenButton() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  return (
    <button
      type="button"
      className="btn-ghost tiny"
      onClick={() => {
        if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
        else void document.exitFullscreen?.();
      }}
    >
      {on ? "Fenêtre" : "Plein écran"}
    </button>
  );
}

export function TableRoom({
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
    <section className="room" data-panel={panel}>
      <div className="table-wrap">
        {view.status === "lobby" ? (
          <Lobby view={view} link={link} host={Boolean(host)} send={send} onCopied={onCopied} />
        ) : view.engine && isPokerView(view.engine) ? (
          <PokerTable view={view.engine} send={send} youId={view.youId} />
        ) : view.engine?.kind === "belote" ? (
          <BeloteTable view={view.engine} send={send} />
        ) : view.engine && isTrickView(view.engine) ? (
          <TrickTable view={view.engine} send={send} />
        ) : view.engine && isEveningView(view.engine) ? (
          <EveningTable view={view.engine} send={send} />
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
        <button type="button" className="btn-ghost" onClick={() => send({ t: "leave" })}>
          Quitter la table
        </button>
      </aside>
    </section>
  );
}
