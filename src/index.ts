import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import * as StellarSdk from "@stellar/stellar-sdk";
import {
  invokeCustomContract,
  SorobanToolkit,
} from "soroban-toolkit";
import { isMainThread, Worker } from "worker_threads";
import { toolkit } from "./toolkit";
import { PairEntry } from "./types";

dotenv.config();

const prisma = new PrismaClient();


const FactoryContract =
  "CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2";

async function main() {
  getAllPairs(toolkit);

  try {
    let lastSequence = 0;
    const pairs: PairEntry[] = await prisma.soroswapPairs.findMany({});
 
    while (true) {
      const ledger = await toolkit.rpc.getLatestLedger();
      if (ledger.sequence !== lastSequence) {
        lastSequence = ledger.sequence;
        // Fetch all pairs
        const pairs = await prisma.soroswapPairs.findMany({});
        // Add your contract indexing logic here

        const half = Math.ceil(pairs.length / 2);
        const pairsChunks = [pairs.slice(0, half), pairs.slice(half)];
        //Spawn workers
        if(isMainThread){
          // Create workers
            const worker = new Worker(__filename, {
              workerData: {
                pairs: pairsChunks[0],
                lastSequence
              },
            });

            //Listen worker messages
            worker.on('message', (result: any) => {
              console.log(`🟢Worker result:`);
              console.log(result);
            });
      
            //Listen worker errors
            worker.on('error', (error: Error) => {
              console.log(error)
              console.error(`Worker error: ${error.message}`);
            });
      
            //Listen worker exit
            worker.on('exit', (code: number) => {
              if (code !== 0) {
                  console.error(`Worker finished with error code: ${code}`);
              } else {
                  console.log('Worker finished Ok.');
              }
            });

            //Send data to worker
            worker.postMessage({ pairs: pairsChunks[0], lastSequence });

            // Define the second worker (It will do the same that the first one but in second thread)
            const worker_1 = new Worker(__filename, {
              workerData: {
                pairs: pairsChunks[1],
                lastSequence
              },
            });
            worker_1.on('message', (result: any) => {
              console.log(`🟡Worker 1 result:`);
              console.log(result);
            });
      
            worker_1.on('error', (error: Error) => {
              console.log(error)
              console.error(`Worker 1 error: ${error.message}`);
            });
      
            worker_1.on('exit', (code: number) => {
              if (code !== 0) {
                  console.error(`Worker 1 finished with error code: ${code}`);
              } else {
                  console.log('Worker 1 finished Ok.');
              }
            });
            worker_1.postMessage({ pairs: pairsChunks[1], lastSequence });
            
        } else {
          // Este es el hilo del worker
          require('./worker');
        }
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