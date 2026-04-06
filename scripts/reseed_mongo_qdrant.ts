import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import { QdrantClient } from '@qdrant/js-client-rest';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Load environment variables
dotenv.config();

/**
 * Get environment variable or throw error if missing
 */
const getOrThrow = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} is missing.`);
  return value;
};

// Configuration
const MONGO_URI = getOrThrow('MONGO_URI');
const MONGO_DB_NAME = getOrThrow('MONGO_INITDB_DATABASE');
const MONGO_COLLECTION_NAME = getOrThrow('MONGO_COLLECTION');

const QDRANT_URL = getOrThrow('QDRANT_URL');
const QDRANT_API_KEY = getOrThrow('QDRANT_API_KEY');
const QDRANT_COLLECTION_NAME = getOrThrow('QDRANT_COLLECTION');

const GEMINI_API_KEY = getOrThrow('GEMINI_API_KEY');
const GEMINI_EMBEDDING_MODEL = getOrThrow('GEMINI_EMBEDDING_MODEL');

const CHUNK_FILE_PATH = path.join(__dirname, '../src/sample_chunks/first_chunk.json');

async function main() {
  console.log('--- [START] RESEEDING DATA (GEMINI API) ---');

  // Initialize clients
  const mongoClient = new MongoClient(MONGO_URI);
  const qdrantClient = new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
  });

  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: GEMINI_API_KEY,
    modelName: GEMINI_EMBEDDING_MODEL,
  });

  try {
    // 1. Connect and clear MongoDB
    console.log('[1/5] Connecting to MongoDB...');
    await mongoClient.connect();
    const db = mongoClient.db(MONGO_DB_NAME);
    const collection = db.collection(MONGO_COLLECTION_NAME);

    console.log(`[1/5] Clearing MongoDB collection: ${MONGO_COLLECTION_NAME}...`);
    await collection.deleteMany({});
    console.log(`[1/5] MongoDB cleared.`);

    // 2. Clear and recreate Qdrant collection
    console.log(`[2/5] Resetting Qdrant collection: ${QDRANT_COLLECTION_NAME}...`);
    const exists = await qdrantClient.collectionExists(QDRANT_COLLECTION_NAME);
    if (exists.exists) {
      await qdrantClient.deleteCollection(QDRANT_COLLECTION_NAME);
    }

    // Get embedding for warm up and to determine vector size
    console.log(`[2/5] Fetching sample embedding with Gemini...`);
    const sampleVector = await embeddings.embedQuery('warm up');
    const vectorSize = sampleVector.length;
    console.log(`[2/5] Vector size: ${vectorSize}`);

    await qdrantClient.createCollection(QDRANT_COLLECTION_NAME, {
      vectors: {
        size: vectorSize,
        distance: 'Cosine',
      },
    });
    console.log(`[2/5] Qdrant collection created.`);

    // 3. Read sample data
    console.log(`[3/5] Reading sample data from: ${CHUNK_FILE_PATH}...`);
    if (!fs.existsSync(CHUNK_FILE_PATH)) {
      throw new Error(`Sample file not found at ${CHUNK_FILE_PATH}`);
    }
    const rawData = fs.readFileSync(CHUNK_FILE_PATH, 'utf-8');
    const chunks = JSON.parse(rawData);
    console.log(`[3/5] Found ${chunks.length} chunks to process.`);

    // 4. Process and seed data
    console.log('[4/5] Starting insertion process...');
    for (const chunk of chunks) {
      // a. Prepare MongoDB document
      const mongoDoc = {
        ...chunk,
        _id: chunk._id ? new ObjectId().toHexString() : new ObjectId().toHexString(), // We'll keep the string format mapping but new IDs
      };
      
      // Actually, if _id is provided as string in JSON (like "ck_toan6_ch1_bai1_p1"), we should probably keep it if it's unique
      // or map it to ObjectId if the service expects it. 
      // Looking at migrate script, it String(doc._id). 
      // I'll keep the IDs from JSON if they exist.
      const docToInsert = { ...chunk };
      if (!docToInsert._id) docToInsert._id = new ObjectId().toHexString();

      // b. Insert into MongoDB
      await collection.insertOne(docToInsert as any);
      console.log(`[4/5] MongoDB: Inserted chunk ${docToInsert._id}`);

      // c. Generate Embedding
      console.log(`[4/5] Gemini: Generating embedding for chunk ${docToInsert._id}...`);
      const vector = await embeddings.embedQuery(docToInsert.chunk_text);

      // d. Insert into Qdrant
      await qdrantClient.upsert(QDRANT_COLLECTION_NAME, {
        wait: true,
        points: [
          {
            id: randomUUID(),
            vector,
            payload: {
              mongo_id: String(docToInsert._id),
              subject: docToInsert.subject_code,
              chapter: docToInsert.chapter_no,
              lesson: docToInsert.lesson_no,
              topic: docToInsert.section_title,
              content: docToInsert.chunk_text,
            },
          },
        ],
      });
      console.log(`[4/5] Qdrant: Inserted point for chunk ${docToInsert._id}`);
      
      // Delay to avoid rate limits if any
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('[5/5] All data seeded successfully!');
  } catch (error) {
    console.error('--- [ERROR] FATAL RE-SEEDING ERROR ---');
    console.error(error);
  } finally {
    await mongoClient.close();
    console.log('--- [DONE] ---');
  }
}

main();
