const MESSAGES = {
  Undercollateralized: "Ratio de collatéralisation insuffisant : l'opération laisserait le coffre sous le minimum requis (150 %).",
  BelowMinDebt: "Dette trop faible : une dette non nulle doit rester au moins égale à la dette minimale (10 000 CDFx).",
  DebtCeilingExceeded: "Le plafond de dette global du protocole serait dépassé.",
  InsufficientCollateral: "Collatéral insuffisant dans le coffre.",
  NoDebt: "Ce coffre n'a pas de dette.",
  VaultHealthy: "Ce coffre est sain : il ne peut pas être liquidé.",
  NoBadDebt: "Aucune dette irrécouvrable à effacer.",
  ZeroAmount: "Le montant doit être supérieur à zéro.",
  EthTransferFailed: "Le transfert d'ETH a échoué.",
  EnforcedPause: "Le protocole est en pause d'urgence pour cette opération.",
  StalePrice: "Le prix Chainlink est périmé (trop ancien). Réessayez plus tard.",
  InvalidPrice: "Le prix de l'oracle est invalide.",
  RateStepTooLarge: "Variation du taux trop grande : maximum ±10 % par mise à jour.",
  InvalidRate: "Taux hors des bornes autorisées (1 000 à 10 000 CDF/USD).",
  CooldownActive: "Robinet : vous avez déjà réclamé récemment. Revenez plus tard.",
  FaucetEmpty: "Le robinet est vide pour le moment.",
  ERC20InsufficientBalance: "Solde de CDFx insuffisant. Les frais de stabilité s'ajoutent à la dette : réclamez des CDFx au robinet (onglet Démo).",
  ERC20InsufficientAllowance: "Autorisation (approve) insuffisante pour le contrat.",
  AccessControlUnauthorizedAccount: "Votre compte n'a pas le droit d'effectuer cette action.",
};

export function explainError(err) {
  const name = err?.name || "";
  const walk = typeof err?.walk === "function" ? err.walk.bind(err) : null;
  if (walk) {
    const rejected = walk((e) => e?.name === "UserRejectedRequestError" || e?.code === 4001);
    if (rejected) return "Transaction annulée dans le portefeuille.";
    const reverted = walk((e) => e?.name === "ContractFunctionRevertedError");
    const errorName = reverted?.data?.errorName;
    if (errorName) return MESSAGES[errorName] || `Le contrat a refusé l'opération (${errorName}).`;
  }
  if (/User rejected|denied transaction/i.test(err?.message || "")) return "Transaction annulée dans le portefeuille.";
  const short = err?.shortMessage || err?.message || name || "Erreur inconnue";
  return short.length > 220 ? `${short.slice(0, 217)}…` : short;
}
