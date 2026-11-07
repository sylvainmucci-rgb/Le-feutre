export const CHAT_MAX = 200;
export const CHAT_HISTORY = 50;
export const CHAT_INTERVAL_MS = 700;

export type ChatMessage = {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  at: number;
};

/** Texte brut, jamais interprété comme du HTML. Les caractères de contrôle sont retirés. */
export function sanitizeChat(raw: string): string {
  const cleaned = raw
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [...cleaned].slice(0, CHAT_MAX).join("");
}

export function pushChat(
  history: readonly ChatMessage[],
  lastAt: number,
  draft: { id: string; playerId: string; nickname: string; text: string },
  now: number,
): { history: ChatMessage[]; lastAt: number; message: ChatMessage } {
  const text = sanitizeChat(draft.text);
  if (!text) throw new Error("Message vide.");
  if (now - lastAt < CHAT_INTERVAL_MS) {
    throw new Error("Un peu moins vite, s'il vous plaît.");
  }
  const message: ChatMessage = {
    id: draft.id,
    playerId: draft.playerId,
    nickname: draft.nickname,
    text,
    at: now,
  };
  const next = [...history, message];
  while (next.length > CHAT_HISTORY) next.shift();
  return { history: next, lastAt: now, message };
}
