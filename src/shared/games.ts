/**
 * Jeux que l'on peut ouvrir à une table.
 * Les règles traditionnelles et les variantes de table sont décrites dans chaque moteur.
 */
export const PLAYABLE_GAMES = [
  {
    id: "texas-holdem",
    name: "Texas Hold'em",
    group: "Poker",
    players: "2 à 8",
    min: 2,
    max: 8,
    stack: true,
    summary: "No-limit, dollars fictifs, blinds fixes, meilleure main de cinq cartes.",
  },
  {
    id: "omaha",
    name: "Omaha",
    group: "Poker",
    players: "2 à 8",
    min: 2,
    max: 8,
    stack: true,
    summary: "Pot-limit. Quatre cartes fermées, exactement deux dans la main finale.",
  },
  {
    id: "stud",
    name: "Seven Card Stud",
    group: "Poker",
    players: "2 à 7",
    min: 2,
    max: 7,
    stack: true,
    summary: "Deux fermées, quatre ouvertes, une dernière fermée. Ante et bring-in aux blinds de la table.",
  },
  {
    id: "draw",
    name: "Poker fermé",
    group: "Poker",
    players: "2 à 6",
    min: 2,
    max: 6,
    stack: true,
    summary: "Cinq cartes, un échange. Blinds fixes à la place de l'ante traditionnel.",
  },
  {
    id: "belote",
    name: "Belote classique",
    group: "Plis",
    players: "4",
    min: 4,
    max: 4,
    stack: false,
    summary: "Prise en deux tours, atout, plis et belote-rebelote. Sans annonces de séquence.",
  },
  {
    id: "coinche",
    name: "Coinche",
    group: "Plis",
    players: "4",
    min: 4,
    max: 4,
    stack: false,
    summary: "Enchères de 80 à 160, capot, coinche et surcoinche. Couleur seulement.",
  },
  {
    id: "tarot",
    name: "Tarot français",
    group: "Plis",
    players: "3 à 5",
    min: 3,
    max: 5,
    stack: false,
    summary: "Prise, garde, garde sans, garde contre. Chien, bouts, excuse. À cinq, appel au roi.",
  },
  {
    id: "manille",
    name: "Manille",
    group: "Plis",
    players: "4",
    min: 4,
    max: 4,
    stack: false,
    summary: "Manille muette du Sud-Ouest. Sans atout, le 10 est le plus fort. Partie en 101.",
  },
  {
    id: "ecarte",
    name: "Écarté",
    group: "Plis",
    players: "2",
    min: 2,
    max: 2,
    stack: false,
    summary: "Règle traditionnelle à deux. Roi maître, atout retourné, échange, partie en 5.",
  },
  {
    id: "bataille",
    name: "Bataille corse",
    group: "Table",
    players: "2 à 6",
    min: 2,
    max: 6,
    stack: false,
    summary: "Cartes retournées ensemble, l'as mène. Égalité : bataille. Donnes courtes, partie en 5.",
  },
] as const;

export type GameId = (typeof PLAYABLE_GAMES)[number]["id"];

export function isGameId(value: unknown): value is GameId {
  return PLAYABLE_GAMES.some((game) => game.id === value);
}

export function gameById(id: GameId) {
  const game = PLAYABLE_GAMES.find((item) => item.id === id);
  if (!game) throw new Error("Jeu inconnu.");
  return game;
}

export const NOT_IN_THIS_VERSION = [] as const;
