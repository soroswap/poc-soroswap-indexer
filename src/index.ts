import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import * as StellarSdk from "@stellar/stellar-sdk";
import {
  createToolkit,
  invokeCustomContract,
  SorobanToolkit,
} from "soroban-toolkit";

dotenv.config();

const prisma = new PrismaClient();
const toolkitLoader = createToolkit({
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
  verbose: "full",
});

const FactoryContract =
  "CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2";

async function main() {
  const toolkit = toolkitLoader.getNetworkToolkit("mainnet");

  getAllPairs(toolkit);

  try {
    console.log("Connecting to database...");
    let lastSequence = 0;

    while (true) {
      const ledger = await toolkit.rpc.getLatestLedger();
      if (ledger.sequence !== lastSequence) {
        lastSequence = ledger.sequence;
        console.log("Ledger Sequence:", ledger.sequence);

        // Fetch all pairs
        const pairs = await prisma.soroswapPairs.findMany({});
        console.log("Pairs:", pairs);

        // Add your contract indexing logic here
      }

      // Delay to avoid overwhelming the server
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

const getAllPairs = async (toolkit: SorobanToolkit) => {
  const raw_pairs_length = await invokeCustomContract(
    toolkit,
    FactoryContract,
    "all_pairs_length",
    [],
    true
  );

  const pairs_length = StellarSdk.scValToNative(raw_pairs_length.result.retval);

  for (let i = 0; i < pairs_length; i++) {
    const raw_pair = await invokeCustomContract(
      toolkit,
      FactoryContract,
      "all_pairs",
      [StellarSdk.nativeToScVal(i, { type: "u32" })],
      true
    );

    const pair_address = StellarSdk.scValToNative(raw_pair.result.retval);

    if (pair_address) {
      const rawTokenA = await invokeCustomContract(
        toolkit,
        pair_address,
        "token_0",
        [],
        true
      );
      const tokenA = StellarSdk.scValToNative(rawTokenA.result.retval);
      // console.log("🚀 « tokenA:", tokenA);

      const rawTokenB = await invokeCustomContract(
        toolkit,
        pair_address,
        "token_1",
        [],
        true
      );
      const tokenB = StellarSdk.scValToNative(rawTokenB.result.retval);
      // console.log("🚀 « tokenB:", tokenB);

      const raw_reserves = await invokeCustomContract(
        toolkit,
        pair_address,
        "get_reserves",
        [],
        true
      );
      const reserves = StellarSdk.scValToNative(raw_reserves.result.retval);
      // console.log("🚀 « reserves:", reserves); // this returns an array of token_a resevre and token_b reserve like [0n, 0n] should be parsed to number and stored with each reserve

      await prisma.soroswapPairs.upsert({
        where: { address: pair_address },
        update: {
          tokenA: tokenA,
          tokenB: tokenB,
          reserveA: Number(reserves[0]),
          reserveB: Number(reserves[1]),
        },
        create: {
          address: pair_address,
          tokenA: tokenA,
          tokenB: tokenB,
          reserveA: Number(reserves[0]),
          reserveB: Number(reserves[1]),
        },
      });
    }
  }
};

main();
