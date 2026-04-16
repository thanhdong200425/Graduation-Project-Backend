import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { PromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export interface QueryBuilderOutput {
  queries: {
    type: 'remember_understand' | 'apply_analyze' | 'evaluate_create';
    text: string;
  }[];
  hyde_passages: string[];
}

export interface BuildSearchContextParams {
  subjectName: string;
  chapterTitle: string;
  chapterNo: number;
  subjectCode: string;
  grade?: number;
}

@Injectable()
export class QueryBuilderService {
  private readonly logger = new Logger(QueryBuilderService.name);
  private readonly llm: BaseChatModel;
  private readonly cache = new Map<string, { output: QueryBuilderOutput; timestamp: number }>();
  private readonly CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(private configService: ConfigService) {
    const apiKey = configService.getOrThrow<string>('GEMINI_API_KEY');
    const model = configService.get<string>('GEMINI_MODEL')?.trim() ?? 'gemini-1.5-flash';

    this.llm = new ChatGoogleGenerativeAI({
      apiKey,
      model,
      temperature: 0.3,
    });
  }

  async buildSearchContext(params: BuildSearchContextParams): Promise<QueryBuilderOutput> {
    const cacheKey = `${params.subjectCode}_ch${params.chapterNo}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.log(`Using cached query context for ${cacheKey}`);
      return cached.output;
    }

    try {
      const output = await this.generateWithLLM(params);
      this.cache.set(cacheKey, { output, timestamp: Date.now() });
      return output;
    } catch (error) {
      this.logger.error('Failed to generate query context with Gemini, falling back to template.', error.stack);
      return this.getFallbackOutput(params);
    }
  }

  private async generateWithLLM(params: BuildSearchContextParams): Promise<QueryBuilderOutput> {
    const parser = new JsonOutputParser<QueryBuilderOutput>();
    const mindset = this.getSubjectMindset(params.subjectName);
    const negativeConstraints = this.getNegativeConstraints();

    const prompt = PromptTemplate.fromTemplate(`
Bạn là một Chuyên gia Sư phạm cao cấp, am hiểu sâu sắc Chương trình Giáo dục Phổ thông (GDPT) 2018 và nội dung bộ sách giáo khoa "Kết nối tri thức".

Nhiệm vụ của bạn là tạo ra các câu truy vấn và văn bản giả định (HyDE) để tối ưu hóa việc tìm kiếm tài liệu từ Vector Database đúng với phong cách và kiến thức của bộ sách này:

Môn học: {subjectName} (Lớp {grade})
Chương {chapterNo}: {chapterTitle}

### 1. TƯ DUY CHUYÊN MÔN (Theo chuẩn bộ sách Kết nối tri thức):
- Tập trung vào cách trình bày, hệ thống thuật ngữ và các đơn vị kiến thức đặc thù của bộ sách "Kết nối tri thức".
{mindset}

### 2. QUY TẮC LOẠI BỎ NHIỄU (Negative Constraints):
{negativeConstraints}

### 3. YÊU CẦU ĐẦU RA (JSON FORMAT):
Hãy trả về một đối tượng JSON duy nhất (không có văn bản ngoài JSON) với cấu trúc các câu truy vấn nhắm vào 3 cấp độ nhận thức Bloom:
{{
  "queries": [
    {{ 
      "type": "remember_understand", 
      "text": "Câu truy vấn tập trung vào các định nghĩa, khái niệm và nội dung cốt lõi theo đúng chương trình bộ sách Kết nối tri thức cho môn {subjectName}" 
    }},
    {{ 
      "type": "apply_analyze", 
      "text": "Câu truy vấn tập trung vào phương pháp giải quyết các dạng bài tập và logic phân tích kiến thức theo cấu trúc bài học của bộ sách" 
    }},
    {{ 
      "type": "evaluate_create", 
      "text": "Câu truy vấn tập trung vào các nội dung vận dụng, mở rộng hoặc bài tập tổng hợp nâng cao có trong sách" 
    }}
  ],
  "hyde_passages": [
    "Một đoạn văn mô tả lý thuyết chương này đúng theo phong cách hành văn và độ sâu kiến thức của bộ sách Kết nối tri thức (khoảng 150-200 từ).",
    "Một đoạn văn mô tả một hướng dẫn giải bài tập hoặc ví dụ điển hình có trong bộ sách Kết nối tri thức (khoảng 150-200 từ)."
  ]
}}

Hãy đảm bảo sử dụng đúng ngôn ngữ chuyên môn sư phạm của bộ sách "Kết nối tri thức".
    `);

    const chain = prompt.pipe(this.llm).pipe(parser);

    const result = await chain.invoke({
      subjectName: params.subjectName,
      chapterNo: params.chapterNo,
      chapterTitle: params.chapterTitle,
      grade: params.grade ?? 'không xác định',
      mindset,
      negativeConstraints,
    });

    return result;
  }

  private getSubjectMindset(subjectName: string): string {
    const normalized = this.normalizeString(subjectName);
    
    const stemKeywords = ['toan', 'vat ly', 'hoa hoc', 'sinh hoc', 'tin hoc', 'cong nghe'];
    const socialKeywords = ['ngu van', 'lich su', 'dia ly', 'giao duc cong dan', 'kinh te'];
    const languageKeywords = ['tieng anh', 'ngoai ngu'];

    if (stemKeywords.some(k => normalized.includes(k))) {
      return `Sử dụng tư duy STEM/Logic: 
- Tập trung vào các thuật ngữ về: định luật, công thức, quy trình biến đổi, điều kiện xác định và ứng dụng tính toán.
- Các câu truy vấn nên tìm kiếm về các bước giải bài tập và bản chất logic của các hiện tượng.`;
    }

    if (socialKeywords.some(k => normalized.includes(k))) {
      return `Sử dụng tư duy Khoa học Xã hội/Nhân văn:
- Tập trung vào các thuật ngữ về: bối cảnh lịch sử, ý nghĩa nhân văn, bút pháp nghệ thuật, quan hệ nguyên nhân - kết quả và phân tích đa chiều.
- Các câu truy vấn nên tìm kiếm về giá trị nội dung, tư tưởng và tác động xã hội.`;
    }

    if (languageKeywords.some(k => normalized.includes(k))) {
      return `Sử dụng tư duy Ngôn ngữ:
- Tập trung vào: cấu trúc ngữ pháp, từ vựng theo chủ đề, ngữ cảnh giao tiếp và kỹ năng diễn đạt.
- Các câu truy vấn nên tìm kiếm về quy tắc sử dụng ngôn ngữ và các mẫu câu điển hình.`;
    }

    return 'Sử dụng tư duy sư phạm tổng quát: Tập trung vào nội dung trọng tâm và các mục tiêu kiến thức, kỹ năng cơ bản của chương.';
  }

  private normalizeString(str: string): string {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getNegativeConstraints(): string {
    return `- Tuyệt đối KHÔNG tìm kiếm hoặc tạo nội dung liên quan đến: "Mục lục" (Table of Contents), "Trang...", "Lời nói đầu", "Lời cảm ơn", "Thông tin xuất bản".
- Bỏ qua các chỉ dẫn kỹ thuật của file scan/PDF hoặc các ghi chú vụn vặt bên lề sách.
- Tránh các phần "Có thể em chưa biết" nếu nó không nằm trong mục tiêu đánh giá chính.`;
  }

  private getFallbackOutput(params: BuildSearchContextParams): QueryBuilderOutput {
    return {
      queries: [
        { type: 'remember_understand', text: `Định nghĩa và lý thuyết trọng tâm môn ${params.subjectName} chương ${params.chapterNo} ${params.chapterTitle}` },
        { type: 'apply_analyze', text: `Phương pháp giải bài tập và phân tích kiến thức môn ${params.subjectName} chương ${params.chapterNo} ${params.chapterTitle}` },
        { type: 'evaluate_create', text: `Ứng dụng thực tế và bài tập tổng hợp nâng cao môn ${params.subjectName} chương ${params.chapterNo} ${params.chapterTitle}` },
      ],
      hyde_passages: [
        `Nội dung kiến thức về ${params.chapterTitle} trong chương trình ${params.subjectName} lớp tương ứng. Bao gồm các khái niệm, đặc điểm và quy luật quan trọng.`,
      ],
    };
  }
}
