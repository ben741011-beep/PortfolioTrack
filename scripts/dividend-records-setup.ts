import clientPromise from "../lib/mongodb";
import {
  DIVIDEND_RECORD_COLLECTION,
  dividendRecordJsonSchema,
} from "../models/DividendRecord";

const write = process.argv.includes("--write");
const newFields = [
  "market",
  "currency",
  "withholdingTaxRate",
  "withholdingTax",
  "netAmount",
] as const;

async function main() {
  const client = await clientPromise;
  const database = client.db();
  const info = await database
    .listCollections(
      { name: DIVIDEND_RECORD_COLLECTION },
      { nameOnly: false },
    )
    .next();

  if (!info?.options?.validator) {
    throw new Error("dividendRecords collection 不存在或沒有 validator");
  }

  const collection = database.collection(DIVIDEND_RECORD_COLLECTION);
  const missingFieldFilter = {
    $or: newFields.map((field) => ({ [field]: { $exists: false } })),
  };
  const safeLegacyFilter = {
    market: { $exists: false },
    currency: { $exists: false },
    withholdingTaxRate: { $exists: false },
    withholdingTax: { $exists: false },
    netAmount: { $exists: false },
    source: { $in: ["twseStock", "tpexStock", "twseEtf", "tpexEtf"] },
  };
  const [totalCount, missingCount, safeLegacyDocuments, indexes] =
    await Promise.all([
      collection.countDocuments({}),
      collection.countDocuments(missingFieldFilter),
      collection
        .find(safeLegacyFilter, { projection: { _id: 1 } })
        .toArray(),
      collection.indexes(),
    ]);

  console.log(
    JSON.stringify(
      {
        mode: write ? "write" : "preview",
        database: database.databaseName,
        collection: DIVIDEND_RECORD_COLLECTION,
        totalCount,
        missingCount,
        safeLegacyCount: safeLegacyDocuments.length,
        indexes: indexes.map(({ name, key, unique }) => ({
          name,
          key,
          unique: Boolean(unique),
        })),
      },
      null,
      2,
    ),
  );

  if (!write) {
    await client.close();
    return;
  }

  if (missingCount !== safeLegacyDocuments.length) {
    throw new Error(
      `有 ${missingCount - safeLegacyDocuments.length} 筆文件不是可安全遷移的既有台股格式`,
    );
  }

  const optionalSchema = {
    ...dividendRecordJsonSchema,
    required: dividendRecordJsonSchema.required.filter(
      (field) => !newFields.includes(field as (typeof newFields)[number]),
    ),
  };

  await database.command({
    collMod: DIVIDEND_RECORD_COLLECTION,
    validator: { $jsonSchema: optionalSchema },
    validationLevel: "strict",
    validationAction: "error",
  });

  const result = await collection.updateMany(safeLegacyFilter, [
    {
      $set: {
        market: "tw",
        currency: "TWD",
        withholdingTaxRate: 0,
        withholdingTax: 0,
        netAmount: "$grossAmount",
      },
    },
  ]);

  await database.command({
    collMod: DIVIDEND_RECORD_COLLECTION,
    validator: { $jsonSchema: dividendRecordJsonSchema },
    validationLevel: "strict",
    validationAction: "error",
  });

  const migratedIds = safeLegacyDocuments.map((document) => document._id);
  const verifiedCount = migratedIds.length
    ? await collection.countDocuments({
        _id: { $in: migratedIds },
        market: "tw",
        currency: "TWD",
        withholdingTaxRate: 0,
        withholdingTax: 0,
        netAmount: { $type: "number" },
      })
    : 0;

  if (verifiedCount !== migratedIds.length) {
    throw new Error("遷移後無法依 _id 完整查回驗證");
  }

  console.log(
    JSON.stringify(
      {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        verifiedCount,
        remainingMissingCount: await collection.countDocuments(
          missingFieldFilter,
        ),
      },
      null,
      2,
    ),
  );

  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
