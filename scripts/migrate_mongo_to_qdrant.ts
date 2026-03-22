import dotenv from 'dotenv';
import { MongoClient, Document } from 'mongodb';
import { QdrantClient } from '@qdrant/js-client-rest';
import ollama from 'ollama';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const ENV_PATH = path.resolve(process.cwd(), '../.env');
const dotConfig = dotenv.config({ path: ENV_PATH });

if (dotConfig.error) {
  throw new Error(
    'Failed to load .env: ',
    dotConfig.error.cause ?? dotConfig.error.message,
  );
}

const getOrThrowVariable = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Value ${name} is missing!`);
  }
  return value;
};

const MONGO_URI = getOrThrowVariable('MONGO_URI');
const MONGO_DB = getOrThrowVariable('MONGO_INITDB_DATABASE');
const MONGO_COLLECTION = getOrThrowVariable('MONGO_COLLECTION');

const QDRANT_URL = getOrThrowVariable('QDRANT_URL');
const QDRANT_API_KEY = getOrThrowVariable('QDRANT_API_KEY');
const QDRANT_COLLECTION = getOrThrowVariable('QDRANT_COLLECTION');

const OLLAMA_HOST = getOrThrowVariable('OLLAMA_BASE_URL');
const EMBEDDING_MODEL = getOrThrowVariable('OLLAMA_EMBEDDING_MODEL');
const BATCH_SIZE = Number(getOrThrowVariable('BATCH_SIZE'));
const RESET_COLLECTION =
  (process.env.RESET_COLLECTION ?? 'false').toLowerCase() === 'true';

interface MongoChunkDoc extends Document {
  _id?: unknown;
  subject_code?: string;
  chapter_no?: number;
  lesson_no?: number;
  section_title?: string;
  chunk_text?: string;
}

interface PreparedDoc {
  doc: MongoChunkDoc;
  text: string;
}

function getTextFromDoc(doc: MongoChunkDoc): string | null {
  const text = doc.chunk_text;
  if (typeof text !== 'string') return null;
  const cleaned = text.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function safePayload(doc: MongoChunkDoc, text: string) {
  const payload = {
    mongo_id: String(doc._id),
    subject: doc.subject_code,
    chapter: doc.chapter_no,
    lesson: doc.lesson_no,
    topic: doc.section_title,
    content: text,
  };

  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  );
}

function chunkList<T>(items: T[], batchSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    chunks.push(items.slice(i, i + batchSize));
  }
  return chunks;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const response = await ollama.embed({
    model: EMBEDDING_MODEL,
    input: texts.map((text) => `search_document: ${text}`),
  });

  return response.embeddings;
}

async function createCollectionIfNeeded(
  client: QdrantClient,
  vectorSize: number,
): Promise<void> {
  const exists = await client.collectionExists(QDRANT_COLLECTION);

  if (exists.exists) {
    console.log(`[INFO] Collection '${QDRANT_COLLECTION}' already exists.`);
    return;
  }

  await client.createCollection(QDRANT_COLLECTION, {
    vectors: {
      size: vectorSize,
      distance: 'Cosine',
    },
  });

  console.log(
    `[INFO] Created collection '${QDRANT_COLLECTION}' with vector size = ${vectorSize}`,
  );
}

async function resetCollectionIfRequested(client: QdrantClient): Promise<void> {
  if (!RESET_COLLECTION) return;

  const exists = await client.collectionExists(QDRANT_COLLECTION);
  if (!exists.exists) {
    console.log(
      `[INFO] Collection '${QDRANT_COLLECTION}' does not exist. Nothing to reset.`,
    );
    return;
  }

  await client.deleteCollection(QDRANT_COLLECTION);
  console.log(
    `[INFO] Deleted collection '${QDRANT_COLLECTION}' because RESET_COLLECTION=true`,
  );
}

async function main(): Promise<void> {
  console.log(`[INFO] Using Ollama host: ${OLLAMA_HOST}`);
  console.log(`[INFO] Using embedding model: ${EMBEDDING_MODEL}`);

  const mongoClient = new MongoClient(MONGO_URI);
  const qdrantClient = new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
  });

  try {
    console.log('[INFO] Connecting to MongoDB...');
    await mongoClient.connect();

    console.log('[INFO] Checking Ollama embedding model...');
    const warmupVectors = await embedTexts(['xin chao']);
    const vectorSize = warmupVectors[0]?.length;

    if (!vectorSize) {
      throw new Error('Failed to get a sample embedding from Ollama.');
    }

    console.log(`[INFO] Vector size: ${vectorSize}`);

    await resetCollectionIfRequested(qdrantClient);
    await createCollectionIfNeeded(qdrantClient, vectorSize);

    const mongoDb = mongoClient.db(MONGO_DB);
    const mongoCollection = mongoDb.collection<MongoChunkDoc>(MONGO_COLLECTION);

    console.log(
      `[INFO] Reading documents from MongoDB: ${MONGO_DB}.${MONGO_COLLECTION}`,
    );
    const docs = await mongoCollection.find({}).toArray();

    if (docs.length === 0) {
      console.warn('[WARN] No documents found in MongoDB collection.');
      return;
    }

    const preparedDocs: PreparedDoc[] = [];
    for (const doc of docs) {
      const text = getTextFromDoc(doc);
      if (!text) {
        console.log(`[SKIP] Document ${String(doc._id)} has no chunk_text`);
        continue;
      }
      preparedDocs.push({ doc, text });
    }

    if (preparedDocs.length === 0) {
      console.warn('[WARN] No valid text chunks found.');
      return;
    }

    console.log(`[INFO] Found ${preparedDocs.length} valid documents.`);

    let totalInserted = 0;
    const batches = chunkList(preparedDocs, BATCH_SIZE);

    for (const [index, batch] of batches.entries()) {
      const batchIndex = index + 1;
      const texts = batch.map((item) => item.text);

      console.log(
        `[INFO] Embedding batch ${batchIndex} with ${texts.length} chunks...`,
      );
      const vectors = await embedTexts(texts);

      const points = batch.map((item, i) => ({
        id: randomUUID(),
        vector: vectors[i],
        payload: safePayload(item.doc, item.text),
      }));

      await qdrantClient.upsert(QDRANT_COLLECTION, {
        wait: true,
        points,
      });

      totalInserted += points.length;
      console.log(
        `[INFO] Inserted batch ${batchIndex}. Total inserted: ${totalInserted}`,
      );
    }

    console.log('[DONE] Migration completed successfully.');
    console.log(`[DONE] Total inserted into Qdrant: ${totalInserted}`);
  } catch (error) {
    console.error('[ERROR] Migration failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await mongoClient.close();
  }
}

void main();
