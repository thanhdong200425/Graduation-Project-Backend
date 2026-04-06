const { Client } = require('pg');
const { randomUUID } = require('crypto');

async function seed() {
  const client = new Client({
    connectionString: "postgresql://postgres:postgres@localhost:5432/graduation_project_db"
  });

  try {
    await client.connect();
    console.log('--- Đang dọn dẹp và nạp dữ liệu mẫu ---');

    // 1. Dọn dẹp dữ liệu cũ (Tùy chọn: Nếu bạn mún xóa hết thì để, không thì comment lại)
    // await client.query('DELETE FROM subjects'); 

    // 2. Tạo Subject (Môn học)
    // Dùng ID chuẩn mà bạn đang thấy trong DB, hoặc tạo ID mới.
    const subjectId = randomUUID(); 
    await client.query(
      'INSERT INTO subjects (id, name, grade, description, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())',
      [subjectId, 'Toán', 6, 'Môn toán lớp 6']
    );
    console.log(`Đã tạo môn học: Toán (Grade: 6, ID: ${subjectId})`);

    // 3. Tạo Chapter (Chương)
    const chapterId = randomUUID();
    await client.query(
      'INSERT INTO chapters (id, "subjectId", name, description, "orderIndex", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
      [chapterId, subjectId, 'Chương 1: Tập hợp', 'Các khái niệm cơ bản về tập hợp', 1]
    );
    console.log(`Đã tạo chương: Chương 1: Tập hợp (ID: ${chapterId})`);

    // 4. Tạo TextbookChunk (Đoạn nội dung)
    const chunkId = randomUUID();
    await client.query(
      'INSERT INTO textbook_chunks (id, "chapterId", lesson, topic, content, keywords, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())',
      [chunkId, chapterId, 'Bài 1: Tập hợp', 'Định nghĩa', 'Tập hợp là một khái niệm cơ bản của toán học.', 'tập hợp']
    );
    console.log(`Đã tạo đoạn nội dung (ID: ${chunkId})`);

    console.log('\n--- Hoàn tất quá trình Seed ---');
    console.log(`Hãy copy subjectId này để dùng: ${subjectId}`);
    console.log(`Hãy copy chapterId này để dùng: ${chapterId}`);

  } catch (err) {
    console.error('Lỗi khi nạp dữ liệu:', err);
  } finally {
    await client.end();
  }
}

seed();
