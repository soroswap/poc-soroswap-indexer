import { scValToNative } from '@stellar/stellar-sdk';
import { parentPort, workerData } from 'worker_threads';
import { toolkit } from './toolkit';
import { WorkerResult } from './types';
import { exit } from 'process';


if (parentPort) {
  parentPort.on('message', async (data: any) => {
      const { pairs, lastSequence } = data;
      console.log(`Scanning for pairs events from ledger:`, lastSequence);
      await getPairsEvents(pairs, lastSequence); 
  });
}

async function getPairsEvents(pairs: any[], ledger: number) {
  // Chunk pairs into groups of 5
  const chunkedPairs = [];
  for (let i = 0; i < pairs.length; i += 5) {
    chunkedPairs.push(pairs.slice(i, i + 5).map(pair => pair.address));
  }
  let events: WorkerResult[] = [];
  // Fetch events for each chunk
  await Promise.allSettled(chunkedPairs.map(async (chunk) => {
    const raw_events_chunk = await toolkit.rpc.getEvents({
      startLedger: ledger - 1,
      filters: [
        {
          type: "contract",
          contractIds: chunk,
        },
      ],
    });
    if (raw_events_chunk.events.length != 0) {
      for (let event of raw_events_chunk.events) {
        const parsedTopics = event.topic.map(topic => scValToNative(topic));
        if (parsedTopics.some(topic => topic === "sync")) {
          const parsedValue = event.value ? scValToNative(event.value) : null;
          const pairAddress = event.contractId?.address().toString();
          events.push({ 
            address: pairAddress || '',
            reserveA: parsedValue.new_reserve_0,
            reserveB: parsedValue.new_reserve_1
           });
        }
      }
    }
  })).catch(error => {
    console.error("Error fetching events:", error);
  });
  parentPort?.postMessage(events);
  exit(0);
}