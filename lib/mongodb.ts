import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("缺少環境變數 MONGODB_URI");
}

const mongoClient = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const globalForMongo = globalThis as typeof globalThis & {
  mongoClientPromise?: Promise<MongoClient>;
};

const clientPromise =
  process.env.NODE_ENV === "development"
    ? (globalForMongo.mongoClientPromise ??= mongoClient.connect())
    : mongoClient.connect();

export default clientPromise;
