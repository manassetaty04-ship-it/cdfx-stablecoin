import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { chain, rpcUrl } from "./config";

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http(rpcUrl) },
  multiInjectedProviderDiscovery: true,
});
