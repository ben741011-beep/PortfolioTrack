import { createHash } from "node:crypto";

import clientPromise from "../lib/mongodb";
import { fetchOfficialUsEconomicEvents } from "../lib/us-economic-event-sources";
import {
  countUsEconomicEvents,
  planUsEconomicEventUpserts,
  serializeUsEconomicEvent,
  upsertUsEconomicEvents,
} from "../models/UsEconomicEvent";

const writeOne = process.argv.includes("--write-one");
const writeAll = process.argv.includes("--write-all");

if (writeOne && writeAll) {
  throw new Error("--write-one 與 --write-all 不可同時使用");
}

async function main() {
  const beforeCount = await countUsEconomicEvents();
  const events = await fetchOfficialUsEconomicEvents();
  const firstEvent = events[0];
  const eventKeys = events.map((event) => event.eventKey);
  const manifestHash = createHash("sha256")
    .update(JSON.stringify([...eventKeys].sort()))
    .digest("hex");
  const plan = await planUsEconomicEventUpserts(events);

  console.log(
    JSON.stringify(
      {
        mode: writeOne ? "write-one" : writeAll ? "write-all" : "preview",
        beforeCount,
        fetchedCount: events.length,
        manifestHash,
        eventKeys,
        plan: {
          insertCount: plan.insertKeys.length,
          updateCount: plan.updateKeys.length,
          skipCount: plan.skipKeys.length,
          insertKeys: plan.insertKeys,
          updateKeys: plan.updateKeys,
          skipKeys: plan.skipKeys,
        },
        firstEvent: {
          eventKey: firstEvent.eventKey,
          releaseAt: firstEvent.releaseAt.toISOString(),
          sourceAgency: firstEvent.sourceAgency,
          sourceUrl: firstEvent.sourceUrl,
        },
      },
      null,
      2,
    ),
  );

  if (!writeOne && !writeAll) {
    await (await clientPromise).close();
    return;
  }

  const result = await upsertUsEconomicEvents(writeAll ? events : [firstEvent]);
  console.log(
    JSON.stringify(
      {
        requestedCount: result.requestedCount,
        insertedCount: result.insertedCount,
        modifiedCount: result.modifiedCount,
        skippedCount: result.skippedCount,
        verifiedCount: result.verifiedCount,
        afterCount: await countUsEconomicEvents(),
        documents: result.documents.map(serializeUsEconomicEvent),
      },
      null,
      2,
    ),
  );
  await (await clientPromise).close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
