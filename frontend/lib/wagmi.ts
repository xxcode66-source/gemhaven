import { http, createConfig, cookieStorage, createStorage } from "wagmi";
import { base, baseSepolia } from "wagmi/chains";

const baseSepoliaRpc = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;
const baseRpc = process.env.NEXT_PUBLIC_BASE_RPC_URL;

/**
 * Base Sepolia is listed first so it is the chain wagmi connects to by default.
 * Base mainnet stays available so mainnet wallets get a clear "deployment is on
 * Sepolia" notice instead of silently reading nothing.
 *
 * No `connectors` are declared on purpose. wagmi's `multiInjectedProviderDiscovery`
 * is on by default, so every EIP-6963 wallet in the browser announces itself and
 * shows up in `useConnect().connectors`. Importing `wagmi/connectors` instead
 * would pull in that barrel's `baseAccount` connector, which reaches
 * `@coinbase/cdp-sdk` and its unpublished optional `@x402/*` peers — those fail
 * to resolve and break `next build` outright.
 */
export const wagmiConfig = createConfig({
  chains: [baseSepolia, base],
  transports: {
    [baseSepolia.id]: http(baseSepoliaRpc),
    [base.id]: http(baseRpc),
  },
  // Next.js renders these components on the server first; cookie storage keeps
  // the connection state consistent across the hydration boundary.
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
