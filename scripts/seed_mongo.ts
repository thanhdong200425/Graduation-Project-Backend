import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://mongo:mongo@localhost:27017/graduation_project_mongodb?authSource=admin";
const MONGO_DB = process.env.MONGO_INITDB_DATABASE || "graduation_project_mongodb";
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || "textbook_chunks";

async function seed() {
  const client = new MongoClient(MONGO_URI);

  try {
    console.log('--- [1] ĐANG KẾT NỐI MONGODB DOCKER ---');
    await client.connect();
    const db = client.db(MONGO_DB);
    const collection = db.collection(MONGO_COLLECTION);

    // Đường dẫn tới file dữ liệu mẫu
    const filePath = path.join(__dirname, '../chunks/math-6-chapter1.json');
    if (!fs.existsSync(filePath)) {
      console.error(`Không tìm thấy file dữ liệu tại: ${filePath}`);
      return;
    }

    const rawData = fs.readFileSync(filePath, 'utf-8');
    const chunks = JSON.parse(rawData);

    // Chuẩn hóa dữ liệu để khớp với script migrate_mongo_to_qdrant.ts
    // Script migrate yêu cầu: subject_code, chapter_no, lesson_no, section_title, chunk_text
    const formattedChunks = chunks.map((item: any) => ({
      subject_code: item.subject,
      chapter_no: 1, // Giả sử chương 1
      lesson_no: 1,  // Giả sử bài 1
      section_title: item.topic || item.lesson,
      chunk_text: item.content
    }));

    console.log(`--- [2] ĐANG LÀM SẠCH DỮ LIỆU CŨ TRONG COLLECTION: ${MONGO_COLLECTION} ---`);
    await collection.deleteMany({});

    console.log(`--- [3] ĐANG NẠP ${formattedChunks.length} ĐOẠN VĂN BẢN (CHUNKS) ---`);
    const result = await collection.insertMany(formattedChunks);

    console.log('--------------------------------------------------');
    console.log(`✅ THÀNH CÔNG! Đã nạp ${result.insertedCount} bản ghi.`);
    console.log(`Bây giờ bạn có thể mở MongoDB Compass để xem database: ${MONGO_DB}`);
    console.log('--------------------------------------------------');

  } catch (error) {
    console.error('❌ LỖI KHI SEED DỮ LIỆU:', error);
  } finally {
    await client.close();
  }
}

seed();
