/**
 * Registre des parties jouables.
 * Omaha, Stud, Draw, Coinche, Tarot et Manille ne sont pas implémentés :
 * ils ne figurent pas ici et ne peuvent pas être créés.
 */
export const PLAYABLE_GAMES = [
  {
    id: "belote",
    name: "Belote classique",
    players: "4 joueurs, 2 équipes",
    summary: "Prise en deux tours, atout, plis et belote-rebelote. Sans annonces de séquence.",
  },
  {
    id: "texas-holdem",
    name: "Texas Hold'em",
    players: "2 à 8 joueurs",
    summary: "Dollars fictifs, blinds fixes, quatre rues d'enchères et meilleure main de cinq cartes.",
  },
] as const;

export type GameId = (typeof PLAYABLE_GAMES)[number]["id"];

export function isGameId(value: unknown): value is GameId {
  return value === "belote" || value === "texas-holdem";
}

export const NOT_IN_THIS_VERSION = [
  "Omaha",
  "Stud",
  "Draw",
  "Coinche",
  "Tarot",
  "Manille",
] as const;
