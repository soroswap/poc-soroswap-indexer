import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import * as StellarSdk from "@stellar/stellar-sdk";
import {
  invokeCustomContract,
  SorobanToolkit,
} from "soroban-toolkit";
import { isMainThread, Worker } from "worker_threads";
import { toolkit } from "./toolkit";
import { PairEntry, WorkerResult } from "./types";
import os from 'os';

dotenv.config();

const prisma = new PrismaClient();
const totalWorkers = os.cpus().length;

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
        // Add your contract indexing logic here

        const parts = Math.ceil(pairs.length / totalWorkers);
        const pairsChunks: any[] = [];
        for (let i = 0; i < totalWorkers; i++) {
          const start = i * parts;
          const end = start + parts;
          pairsChunks.push(pairs.slice(start, end));
        }
        //Spawn workers
        if (isMainThread) {

          // Create workers
          const workers: Worker[] = [];
          for (let i = 0; i < totalWorkers; i++) {
            //Create a new instance for each worker
            const worker = new Worker(__filename, {
              workerData: {
                pairs: pairsChunks[i],
                lastSequence
              },
            });

            //Hello world from worker
            worker.on('online', () => {
              console.log(`Worker ${i} running...`);
            });

            //Listen worker messages
            worker.on('message', async (result: WorkerResult[]) => {
              if(result.length === 0){
                console.log(`No events received from worker ${i}...`);
              } else if (result.length != 0) {
                console.log(`🟡 Sync result from worker ${i}`);
                await syncDB(result);
              }
            });

            //Listen worker errors
            worker.on('error', (error: Error) => {
              console.log(error);
              console.error(`Worker ${i} error: ${error.message}`);
            });

            //Listen worker exit
            worker.on('exit', (code: number) => {
              if (code !== 0) {
                  console.error(`Worker ${i} closed with error code: ${code}`);
              } else {
                  console.log(`Worker ${i} closed Ok.`);
              }
            });
            //Push worker to workers array
            workers.push(worker);
          }

          //Call every worker and send the data
          workers.forEach((worker, i) => {
            worker.postMessage({ pairs: pairsChunks[i], lastSequence });
          });

        } else {
          // Require worker file
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

const syncDB = async (newPairs: WorkerResult[]) => {
  for (let i = 0; i < newPairs.length; i++) {
    const pair = newPairs[i];
    console.log('✅Updating pair:')
    console.log(pair);
    await prisma.soroswapPairs.update({
      where: { address: pair.address },
      data: {
        reserveA: pair.reserveA,
        reserveB: pair.reserveB,
      },
    });
  }
};
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