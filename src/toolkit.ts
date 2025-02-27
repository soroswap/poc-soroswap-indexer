import { createToolkit } from "soroban-toolkit";

export const toolkitLoader = createToolkit({
  adminSecret: process.env.ADMIN_SECRET_KEY!,
  customNetworks: [
    {
      network: "mainnet",
      friendbotUrl: "",
      horizonRpcUrl:
        "https://rpc.ankr.com/premium-http/stellar_horizon/670aa62bb995fe0c0e45b316b0c4aca229b2cf47a6a8f44c7803e79c11cf8f5f",
      sorobanRpcUrl:
        "https://rpc.ankr.com/stellar_soroban/670aa62bb995fe0c0e45b316b0c4aca229b2cf47a6a8f44c7803e79c11cf8f5f",
      networkPassphrase: "Public Global Stellar Network ; September 2015",
    },
  ],
  verbose: "none",
});

export const toolkit = toolkitLoader.getNetworkToolkit("mainnet");