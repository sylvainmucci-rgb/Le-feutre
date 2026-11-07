/** Tailles de relance affichées comme sur une table rapide. Le montant est le total de la rue. */

export function clampRaise(target: number, minTo: number, maxTo: number): number {
  return Math.max(minTo, Math.min(maxTo, Math.round(target)));
}

export function sizedRaise(input: {
  pot: number;
  toCall: number;
  streetBet: number;
  minTo: number;
  maxTo: number;
  fraction: number;
}): number {
  const potAfterCall = Math.max(0, input.pot) + Math.max(0, input.toCall);
  const increment = Math.max(1, Math.round(potAfterCall * input.fraction));
  return clampRaise(input.streetBet + Math.max(0, input.toCall) + increment, input.minTo, input.maxTo);
}
