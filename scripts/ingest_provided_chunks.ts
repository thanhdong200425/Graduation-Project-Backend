import dotenv from 'dotenv';
import { MongoClient, Document } from 'mongodb';
import { QdrantClient } from '@qdrant/js-client-rest';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

// Load environment variables
const ENV_PATH = path.resolve(process.cwd(), '.env');
dotenv.config({ path: ENV_PATH });

const MONGO_URI = process.env.MONGO_URI || '';
const MONGO_DB = process.env.MONGO_INITDB_DATABASE || '';
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || 'textbook_chunks';

const QDRANT_URL = process.env.QDRANT_URL || '';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || '';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'textbook_chunks';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004';

async function main() {
  console.log('--- [1] KHỞI TẠO CẤU HÌNH ---');

  if (!GEMINI_API_KEY) {
    console.error('Lỗi: Thiếu GEMINI_API_KEY trong file .env');
    process.exit(1);
  }

  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: GEMINI_API_KEY,
    modelName: GEMINI_EMBEDDING_MODEL,
  });

  const mongoClient = new MongoClient(MONGO_URI);
  const qdrantClient = new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
  });

  try {
    // 1. Đọc file dữ liệu
    const dataPath = path.resolve(process.cwd(), 'src/sample_chunks/third_chunk.json');
    if (!fs.existsSync(dataPath)) {
      console.error(`Lỗi: Không tìm thấy file tại ${dataPath}`);
      return;
    }
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    const chunks = JSON.parse(rawData);
    console.log(`Đã đọc ${chunks.length} chunks từ file.`);

    // 2. Kết nối và nạp vào MongoDB (Upsert)
    console.log('--- [2] ĐANG NẠP DỮ LIỆU VÀO MONGODB ---');
    await mongoClient.connect();
    const db = mongoClient.db(MONGO_DB);
    const collection = db.collection(MONGO_COLLECTION);

    for (const chunk of chunks) {
      const { _id, ...updateData } = chunk;
      await collection.updateOne(
        { _id: _id },
        { $set: updateData },
        { upsert: true }
      );
    }
    console.log('Hoàn tất cập nhật MongoDB.');

    // 3. Tạo embedding và nạp vào Qdrant
    console.log('--- [3] ĐANG TẠO EMBEDDING VÀ NẠP VÀO QDRANT ---');

    // Kiểm tra collection Qdrant
    const exists = await qdrantClient.collectionExists(QDRANT_COLLECTION);
    if (!exists.exists) {
      console.log(`Đang tạo collection Qdrant: ${QDRANT_COLLECTION}`);
      // Lấy vector mẫu để biết kích thước
      const sampleEmbed = await embeddings.embedQuery('test');
      await qdrantClient.createCollection(QDRANT_COLLECTION, {
        vectors: {
          size: sampleEmbed.length,
          distance: 'Cosine',
        },
      });
    }

    let totalInserted = 0;
    // Xử lý theo đợt (batch) để tránh quá tải
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((c: any) => c.chunk_text);

      console.log(`Đang tạo embedding cho batch ${Math.floor(i / batchSize) + 1}...`);
      const vectors = await embeddings.embedDocuments(texts);

      const points = batch.map((chunk: any, index: number) => ({
        id: randomUUID(),
        vector: vectors[index],
        payload: {
          mongo_id: String(chunk._id),
          subject: chunk.subject_code,
          chapter: chunk.chapter_no,
          lesson: chunk.lesson_no,
          topic: chunk.section_title,
          content: chunk.chunk_text,
        },
      }));

      await qdrantClient.upsert(QDRANT_COLLECTION, {
        wait: true,
        points,
      });

      totalInserted += points.length;
      console.log(`Đã nạp ${totalInserted}/${chunks.length} vào Qdrant.`);
    }

    console.log('--- [XONG] QUÁ TRÌNH NẠP DỮ LIỆU HOÀN TẤT ---');

  } catch (error) {
    console.error('Lỗi trong quá trình thực thi:', error);
  } finally {
    await mongoClient.close();
  }
}

main();
