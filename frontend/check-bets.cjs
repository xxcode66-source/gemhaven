const { createPublicClient, http, formatEther } = require("viem");
const { baseSepolia } = require("viem/chains");
const abi = require("../contracts/out/abi/GemHaven.json");

const OLD = "0x444b9027c7e76e9c62A8EFe1e6364C77b7D5f215";

const client = createPublicClient({
  chain: baseSepolia,
  transport: http("https://base-sepolia-rpc.publicnode.com"),
});

const KINDS = ["Pick", "Even", "Odd", "All"];

(async () => {
  for (const id of [6n, 9n, 10n]) {
    const v = await client.readContract({ address: OLD, abi, functionName: "getBet", args: [id] });
    const [player, stake, kind, claimed, bonanzaPaid] = Array.isArray(v)
      ? v
      : [v.player, v.stake, v.kind, v.claimed, v.bonanzaPaid];
    console.log(
      `#${id}: ${KINDS[Number(kind)]} stake=${formatEther(stake)} claimed=${claimed} bonanzaPaid=${bonanzaPaid}`
    );
  }
})().catch((e) => {
  console.error(e.shortMessage || e.message);
  process.exit(1);
});
