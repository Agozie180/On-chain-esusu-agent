// Deployment config. After deploying, run `npm run publish:config` (reads deployments/portaldot.json) so anyone who opens
// the page sees the live circles immediately, with no wallet and nothing to paste.
window.ESUSU_CONFIG = {
  registry: "",
  rpc: "https://test-evm-rpc-v3.portaldot.dev",
  chainId: 420420777,
  network: "PortaldotV3 Testnet",
  symbol: "tPOTv3",
  explorer: "https://node-console.portaldot.dev/",
};
