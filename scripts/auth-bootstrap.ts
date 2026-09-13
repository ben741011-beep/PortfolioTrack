import { ObjectId } from "mongodb";

import clientPromise from "../lib/mongodb";
import { auth } from "../models/Auth";
import {
  findAuthUserIdByEmail,
  prepareAuthCollections,
} from "../models/AuthCollections";
import {
  assignLegacyDataToUser,
  assertMigrationCanTargetUser,
  finalizePersonalCollectionOwnership,
  inspectOwnershipMigration,
  preparePersonalCollectionsForOwnership,
  verifyOwnershipByIds,
} from "../models/OwnershipMigration";

function readArgument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(
    prefix.length,
  );
}

function printInspection(
  inspection: Awaited<ReturnType<typeof inspectOwnershipMigration>>,
) {
  console.log(`目標 database：${inspection.database}`);
  for (const collection of inspection.collections) {
    console.log(
      `${collection.name}: 總數 ${collection.totalCount}, 未歸戶 ${collection.unownedCount}, ` +
        `validator ${collection.validatorPresent ? "已存在" : "缺少"}, ` +
        `indexes ${collection.indexes.map((index) => index.name).join(", ")}`,
    );
    console.log(`  未歸戶 _id：${collection.unownedIds.join(", ") || "無"}`);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const inspection = await inspectOwnershipMigration();
  printInspection(inspection);

  if (dryRun) {
    assertMigrationCanTargetUser(inspection);
    console.log("dry-run 完成：未建立帳號，未修改 validator、索引或文件。");
    return;
  }

  const name = readArgument("name")?.trim();
  const email = readArgument("email")?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_PASSWORD;

  if (!name || !email) {
    throw new Error("實際執行需要 --name=顯示名稱 與 --email=登入信箱");
  }
  if (!password) {
    throw new Error("缺少目前 PowerShell session 的 BOOTSTRAP_PASSWORD");
  }
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error("缺少 BETTER_AUTH_SECRET，請先設定至少 32 字元的高熵密鑰");
  }

  await prepareAuthCollections();
  let userId = await findAuthUserIdByEmail(email);
  let accountCreated = false;

  if (!userId) {
    const result = await auth.api.signUpEmail({
      body: { name, email, password },
    });
    userId = result.user.id;
    accountCreated = true;
  }

  if (!ObjectId.isValid(userId)) {
    throw new Error("首帳 user ID 不是有效的 MongoDB ObjectId 字串");
  }

  assertMigrationCanTargetUser(inspection, userId);
  await preparePersonalCollectionsForOwnership();
  const modifiedCounts = await assignLegacyDataToUser(userId);
  const verifiedCounts = await verifyOwnershipByIds(userId, inspection);
  await finalizePersonalCollectionOwnership();
  const finalInspection = await inspectOwnershipMigration();
  assertMigrationCanTargetUser(finalInspection, userId);

  console.log(`首帳：${email}（${accountCreated ? "已建立" : "已存在"}）`);
  console.log(`userId：${userId}`);
  console.log(`實際修改：${JSON.stringify(modifiedCounts)}`);
  console.log(`依 _id 驗證：${JSON.stringify(verifiedCounts)}`);
  console.log("帳號建立與既有資料歸戶完成。");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const client = await clientPromise;
    await client.close();
  });
