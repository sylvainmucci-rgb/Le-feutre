export function FictionalBanner({ compact = false }: { compact?: boolean }) {
  return (
    <p className={compact ? "fictional compact" : "fictional"} role="note">
      Dollars fictifs, sans valeur réelle. Aucun paiement, aucun retrait, aucun gain.
    </p>
  );
}
