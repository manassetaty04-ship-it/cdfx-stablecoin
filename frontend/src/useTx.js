import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { contracts, errorAbi } from "./config";
import { explainError } from "./errors";
import { useToast } from "./toast";

/**
 * Envoie une transaction : simulation (pour afficher un message clair si elle echouerait),
 * signature dans le portefeuille, attente de confirmation, rafraichissement des donnees.
 *   send({ label, contract: "VaultManager", functionName: "mint", args: [..], value })
 */
export function useTx() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const qc = useQueryClient();
  const toast = useToast();

  return async function send({ label, contract, functionName, args = [], value }) {
    const c = contracts[contract];
    const id = toast.push({ kind: "pending", text: `${label} : vérification…` });
    try {
      const { request } = await publicClient.simulateContract({
        account: address,
        address: c.address,
        abi: [...c.abi, ...errorAbi],
        functionName,
        args,
        value,
      });
      toast.update(id, { kind: "pending", text: `${label} : confirmez dans votre portefeuille…` });
      const hash = await writeContractAsync(request);
      toast.update(id, { kind: "pending", text: `${label} : transaction envoyée, en attente de confirmation…`, hash });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("La transaction a échoué (revert).");
      toast.update(id, { kind: "success", text: `${label} : confirmée.`, hash });
      await qc.invalidateQueries();
      return receipt;
    } catch (e) {
      console.error(e);
      toast.update(id, { kind: "error", text: `${label} : ${explainError(e)}` });
      return null;
    }
  };
}
