import { useAccount, useBalance, usePublicClient, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { keccak256, parseAbiItem, toBytes } from "viem";
import { contracts, deployBlock, isDeployed } from "./config";

const VM = contracts.VaultManager;
const ORACLE = contracts.CDFxOracle;
const TOKEN = contracts.CDFxToken;

/** Etat global du protocole + donnees d'oracle (rafraichi toutes les 15 s) */
export function useProtocol() {
  const q = useReadContracts({
    contracts: [
      { ...VM, functionName: "getProtocolStats" },
      { ...ORACLE, functionName: "usdCdfRate" },
      { ...ORACLE, functionName: "rateUpdatedAt" },
      { ...ORACLE, functionName: "ethUsd" },
      { ...ORACLE, functionName: "maxFeedAge" },
    ],
    query: { enabled: isDeployed, refetchInterval: 15_000 },
  });
  const d = q.data;
  const ethUsd = d?.[3]?.status === "success" ? { price: d[3].result[0], updatedAt: d[3].result[1] } : null;
  return {
    loading: q.isLoading,
    error: q.error,
    stats: d?.[0]?.status === "success" ? d[0].result : null,
    usdCdfRate: d?.[1]?.status === "success" ? d[1].result : null,
    rateUpdatedAt: d?.[2]?.status === "success" ? d[2].result : null,
    ethUsd,
    maxFeedAge: d?.[4]?.status === "success" ? d[4].result : null,
    refetch: q.refetch,
  };
}

/** Coffre et soldes du compte connecte */
export function useMyVault() {
  const { address } = useAccount();
  const enabled = isDeployed && Boolean(address);
  const q = useReadContracts({
    contracts: address
      ? [
          { ...VM, functionName: "getVault", args: [address] },
          { ...VM, functionName: "collateralRatioBps", args: [address] },
          { ...VM, functionName: "liquidationPrice", args: [address] },
          { ...VM, functionName: "maxMintable", args: [address] },
          { ...VM, functionName: "maxWithdrawable", args: [address] },
          { ...TOKEN, functionName: "balanceOf", args: [address] },
          { ...TOKEN, functionName: "allowance", args: [address, VM.address] },
        ]
      : [],
    query: { enabled, refetchInterval: 15_000 },
  });
  const eth = useBalance({ address, query: { enabled, refetchInterval: 20_000 } });
  const d = q.data;
  const ok = (i) => (d?.[i]?.status === "success" ? d[i].result : null);
  return {
    address,
    loading: q.isLoading,
    collateral: ok(0)?.[0] ?? 0n,
    debt: ok(0)?.[1] ?? 0n,
    ratioBps: ok(1),
    liquidationPrice: ok(2),
    maxMintable: ok(3),
    maxWithdrawable: ok(4),
    cdfxBalance: ok(5) ?? 0n,
    allowance: ok(6) ?? 0n,
    ethBalance: eth.data?.value ?? 0n,
  };
}

const VAULT_UPDATED = parseAbiItem("event VaultUpdated(address indexed owner, uint256 collateral, uint256 debt)");
const scanCache = { next: null, owners: new Set() };

async function getLogsAdaptive(client, from, to, depth = 0) {
  try {
    return await client.getLogs({ address: VM.address, event: VAULT_UPDATED, fromBlock: from, toBlock: to });
  } catch (e) {
    if (from >= to || depth > 12) throw e;
    const mid = from + (to - from) / 2n;
    const a = await getLogsAdaptive(client, from, mid, depth + 1);
    const b = await getLogsAdaptive(client, mid + 1n, to, depth + 1);
    return [...a, ...b];
  }
}

/** Adresses ayant deja ouvert un coffre (lues dans les evenements VaultUpdated, analyse incrementale) */
export function useVaultOwners() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["vaultOwners", VM.address],
    enabled: isDeployed && Boolean(client),
    refetchInterval: 30_000,
    queryFn: async () => {
      const latest = await client.getBlockNumber();
      let from = scanCache.next ?? deployBlock;
      const CHUNK = 40_000n;
      while (from <= latest) {
        const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
        const logs = await getLogsAdaptive(client, from, to);
        for (const l of logs) scanCache.owners.add(l.args.owner);
        from = to + 1n;
      }
      scanCache.next = latest + 1n;
      return [...scanCache.owners];
    },
  });
}

/** Etat actuel de chaque coffre connu */
export function useVaults(owners) {
  const list = owners ?? [];
  const q = useReadContracts({
    contracts: list.map((o) => ({ ...VM, functionName: "getVault", args: [o] })),
    query: { enabled: isDeployed && list.length > 0, refetchInterval: 20_000 },
  });
  const vaults = list.map((owner, i) => {
    const r = q.data?.[i];
    const ok = r?.status === "success";
    return { owner, collateral: ok ? r.result[0] : 0n, debt: ok ? r.result[1] : 0n };
  });
  return { vaults, loading: q.isLoading };
}

/** Faucet */
export function useFaucet() {
  const { address } = useAccount();
  const F = contracts.CDFxFaucet;
  const q = useReadContracts({
    contracts: [
      { ...F, functionName: "claimAmount" },
      { ...F, functionName: "cooldown" },
      { ...TOKEN, functionName: "balanceOf", args: [F.address] },
      ...(address ? [{ ...F, functionName: "nextClaimAt", args: [address] }] : []),
    ],
    query: { enabled: isDeployed && Boolean(F.address), refetchInterval: 20_000 },
  });
  const d = q.data;
  const ok = (i) => (d?.[i]?.status === "success" ? d[i].result : null);
  return { claimAmount: ok(0), cooldown: ok(1), balance: ok(2), nextClaimAt: address ? ok(3) : null };
}

/** Roles du compte connecte (pour afficher le panneau d'administration de demonstration) */
const RATE_UPDATER_ROLE = keccak256(toBytes("RATE_UPDATER_ROLE"));
const PAUSER_ROLE = keccak256(toBytes("PAUSER_ROLE"));

export function useRoles() {
  const { address } = useAccount();
  const q = useReadContracts({
    contracts: address
      ? [
          { ...ORACLE, functionName: "hasRole", args: [RATE_UPDATER_ROLE, address] },
          { ...VM, functionName: "hasRole", args: [PAUSER_ROLE, address] },
        ]
      : [],
    query: { enabled: isDeployed && Boolean(address) },
  });
  return {
    canSetRate: q.data?.[0]?.status === "success" ? q.data[0].result : false,
    canPause: q.data?.[1]?.status === "success" ? q.data[1].result : false,
  };
}
