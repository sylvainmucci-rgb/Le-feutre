import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../shared/chat";

export function ChatLine({ nickname, text, mine }: { nickname: string; text: string; mine: boolean }) {
  return (
    <li className={mine ? "mine" : ""}>
      <span className="who">{nickname}</span>
      <span className="what">{text}</span>
    </li>
  );
}

export function ChatPanel({
  messages,
  youId,
  onSend,
}: {
  messages: ChatMessage[];
  youId: string;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);
  return (
    <section className="chat" aria-label="Discussion de la table">
      <header>
        <h2>Discussion</h2>
        <p>Uniquement les joueurs de cette table. Rien n'est gardé après la fermeture.</p>
      </header>
      <ol>
        {messages.length === 0 ? <li className="empty">La table est silencieuse.</li> : null}
        {messages.map((message) => (
          <ChatLine
            key={message.id}
            nickname={message.nickname}
            text={message.text}
            mine={message.playerId === youId}
          />
        ))}
        <li ref={end} className="end" aria-hidden="true" />
      </ol>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = text.trim();
          if (!value) return;
          onSend(value);
          setText("");
        }}
      >
        <label htmlFor="chat-input">Message à la table</label>
        <input
          id="chat-input"
          maxLength={200}
          value={text}
          placeholder="Écrire aux joueurs de la table"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" disabled={text.trim().length === 0}>
          Envoyer
        </button>
      </form>
    </section>
  );
}
