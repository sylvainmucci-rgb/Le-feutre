/** Réactions et bibelots de table. Aucun effet sur les cartes. */

export const REACTIONS = ["😂", "🔥", "😮", "👏"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const TRINKETS = [
  { id: "rien", label: "Rien sur la table" },
  { id: "canard", label: "Canard en plastique" },
  { id: "cigare", label: "Cigare en chocolat" },
  { id: "verre", label: "Verre à pied" },
  { id: "de", label: "Dé en bois" },
  { id: "etoile", label: "Étoile en papier" },
] as const;

export type TrinketId = (typeof TRINKETS)[number]["id"];

const TRINKET_IDS = new Set<string>(TRINKETS.map((item) => item.id));

export function isReaction(value: unknown): value is Reaction {
  return typeof value === "string" && (REACTIONS as readonly string[]).includes(value);
}

export function isTrinket(value: unknown): value is TrinketId {
  return typeof value === "string" && TRINKET_IDS.has(value);
}

export function trinketForName(name: string): TrinketId {
  const fun = TRINKETS.filter((item) => item.id !== "rien");
  let hash = 0;
  for (const char of name) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return fun[hash % fun.length]!.id;
}

export const FELT_COLORS = [
  { id: "vert", label: "Feutre vert" },
  { id: "bleu", label: "Feutre bleu" },
  { id: "bordeaux", label: "Feutre bordeaux" },
  { id: "violet", label: "Feutre violet" },
] as const;

export const CARD_BACKS = [
  { id: "salon", label: "Dos salon" },
  { id: "nuit", label: "Dos nuit" },
  { id: "soleil", label: "Dos soleil" },
  { id: "carnaval", label: "Dos carnaval" },
] as const;

export type FeltId = (typeof FELT_COLORS)[number]["id"];
export type BackId = (typeof CARD_BACKS)[number]["id"];

export function isFelt(value: unknown): value is FeltId {
  return typeof value === "string" && FELT_COLORS.some((item) => item.id === value);
}

export function isBack(value: unknown): value is BackId {
  return typeof value === "string" && CARD_BACKS.some((item) => item.id === value);
}

export const QUIPS = [
  "Le croupier allume la lampe : les dollars restent fictifs, la soirée non.",
  "Qui a posé le canard sur la petite blind ?",
  "Le feutre a vu pire qu'un bluff raté.",
  "Le verre est vide, le tapis est imaginaire, l'ami est là.",
  "Si la donne est belle, les confettis sont offerts par la maison.",
  "Le cigare est en chocolat. On ne fume pas à cette table.",
  "Le dé en bois ne décide de rien. C'est vous.",
  "Applaudissez fort : même les jetons sont en chocolat.",
];

export function quipFor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash + char.charCodeAt(0)) % QUIPS.length;
  return QUIPS[hash] ?? QUIPS[0]!;
}
