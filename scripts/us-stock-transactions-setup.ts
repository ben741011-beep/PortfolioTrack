import clientPromise from "../lib/mongodb";
import {
  US_STOCK_TRANSACTION_COLLECTION,
  usStockTransactionIndexes,
  usStockTransactionJsonSchema,
} from "../models/UsStockTransaction";

const write = process.argv.includes("--write");

async function inspect() {
  const client = await clientPromise;
  const database = client.db();
  const info = await database
    .listCollections(
      { name: US_STOCK_TRANSACTION_COLLECTION },
      { nameOnly: false },
    )
    .next();

  if (!info) {
    return {
      database: database.databaseName,
      collection: US_STOCK_TRANSACTION_COLLECTION,
      exists: false,
      count: 0,
      validator: null,
      indexes: [],
    };
  }

  const collection = database.collection(US_STOCK_TRANSACTION_COLLECTION);
  const [count, indexes] = await Promise.all([
    collection.countDocuments({}),
    collection.indexes(),
  ]);

  return {
    database: database.databaseName,
    collection: US_STOCK_TRANSACTION_COLLECTION,
    exists: true,
    count,
    validator: info.options?.validator ?? null,
    indexes: indexes.map((index) => ({
      name: index.name,
      key: index.key,
      unique: Boolean(index.unique),
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

  if (!before.exists) {
    await database.createCollection(US_STOCK_TRANSACTION_COLLECTION, {
      validator: { $jsonSchema: usStockTransactionJsonSchema },
      validationLevel: "strict",
      validationAction: "error",
    });
  } else {
    if (before.count !== 0) {
      throw new Error(
        `${US_STOCK_TRANSACTION_COLLECTION} 已有 ${before.count} 筆資料，停止修改 validator`,
      );
    }

    await database.command({
      collMod: US_STOCK_TRANSACTION_COLLECTION,
      validator: { $jsonSchema: usStockTransactionJsonSchema },
      validationLevel: "strict",
      validationAction: "error",
    });
  }

  const collection = database.collection(US_STOCK_TRANSACTION_COLLECTION);
  for (const index of usStockTransactionIndexes) {
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
