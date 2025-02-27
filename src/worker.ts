import { scValToNative } from '@stellar/stellar-sdk';
import { parentPort, workerData } from 'worker_threads';
import { toolkit } from './toolkit';
import { WorkerResult } from './types';
import { exit } from 'process';


if (parentPort) {
  //Listen for messages from the parent thread
  parentPort.on('message', async (data: any) => {
      // Get pairs and last sequence from the parent thread
      const { pairs, lastSequence } = data;
      
      // Fetch events for the pairs
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
  // Fetch events for each chunk, and push the events to the events array
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
  // Send the events to the parent thread
  parentPort?.postMessage(events);
  // Close thread
  exit(0);
}