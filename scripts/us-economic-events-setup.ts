import clientPromise from "../lib/mongodb";
import {
  US_ECONOMIC_EVENT_COLLECTION,
  usEconomicEventIndexes,
  usEconomicEventJsonSchema,
} from "../models/UsEconomicEvent";

const write = process.argv.includes("--write");

async function inspect() {
  const client = await clientPromise;
  const database = client.db();
  const info = await database
    .listCollections(
      { name: US_ECONOMIC_EVENT_COLLECTION },
      { nameOnly: false },
    )
    .next();

  if (!info) {
    return {
      database: database.databaseName,
      collection: US_ECONOMIC_EVENT_COLLECTION,
      exists: false,
      count: 0,
      validator: null,
      validationLevel: null,
      validationAction: null,
      indexes: [],
    };
  }

  const collection = database.collection(US_ECONOMIC_EVENT_COLLECTION);
  const [count, indexes] = await Promise.all([
    collection.countDocuments({}),
    collection.indexes(),
  ]);

  return {
    database: database.databaseName,
    collection: US_ECONOMIC_EVENT_COLLECTION,
    exists: true,
    count,
    validator: info.options?.validator ?? null,
    validationLevel: info.options?.validationLevel ?? null,
    validationAction: info.options?.validationAction ?? null,
    indexes: indexes.map(({ name, key, unique, sparse, partialFilterExpression }) => ({
      name,
      key,
      unique: Boolean(unique),
      sparse: Boolean(sparse),
      partialFilterExpression: partialFilterExpression ?? null,
    })),
  };
}

async function main() {
  const client = await clientPromise;
  const database = client.db();
  const before = await inspect();

  console.log(
    JSON.stringify({ mode: write ? "write" : "preview", before }, null, 2),
  );

  if (!write) {
    await client.close();
    return;
  }

  if (before.exists) {
    throw new Error(
      `${US_ECONOMIC_EVENT_COLLECTION} 已存在；本次核准只允許建立新 collection，停止執行`,
    );
  }

  await database.createCollection(US_ECONOMIC_EVENT_COLLECTION, {
    validator: { $jsonSchema: usEconomicEventJsonSchema },
    validationLevel: "strict",
    validationAction: "error",
  });

  const collection = database.collection(US_ECONOMIC_EVENT_COLLECTION);
  for (const index of usEconomicEventIndexes) {
    await collection.createIndex(index.key!, index);
  }

  const after = await inspect();
  console.log(JSON.stringify({ after }, null, 2));
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
