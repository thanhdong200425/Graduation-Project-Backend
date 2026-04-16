import { Injectable, ServiceUnavailableException, Logger } from '@nestjs/common';
import { OllamaEmbeddings } from '@langchain/ollama';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { RetrievedChunk } from '../types/question.types';
import { ConfigService } from '@nestjs/config';
import { Embeddings } from '@langchain/core/embeddings';
import { QueryBuilderService } from './query-builder.service';
import { SubjectsService } from '../../subjects/subjects.service';
import { ChaptersService } from '../../chapters/chapters.service';
import { ChapterRetrievalService as ChapterRetrievalServiceType } from './chapter-retrieval.service';
import * as crypto from 'crypto';
import { saveRagTrace } from '../utils/rag-trace.util';

@Injectable()
export class ChapterRetrievalService {
  private readonly logger = new Logger(ChapterRetrievalService.name);
  private readonly qdrantClient: QdrantClient;
  private readonly collectionName: string;
  private readonly embeddings: Embeddings;

  constructor(
    private configService: ConfigService,
    private queryBuilderService: QueryBuilderService,
    private subjectsService: SubjectsService,
    private chaptersService: ChaptersService,
  ) {
    const qdrantUrl = configService.getOrThrow<string>('QDRANT_URL');
    const qdrantApiKey = configService.getOrThrow<string>('QDRANT_API_KEY');
    const modelType = (configService.get<string>('MODEL_TYPE') ?? 'OLLAMA')
      .trim()
      .toUpperCase();

    this.collectionName = configService.getOrThrow('QDRANT_COLLECTION');
    this.qdrantClient = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantApiKey,
    });

    if (modelType === 'API') {
      const apiKey = configService.getOrThrow<string>('GEMINI_API_KEY');
      const model =
        configService.get<string>('GEMINI_EMBEDDING_MODEL')?.trim() ??
        'text-embedding-004';

      this.embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey,
        modelName: model,
      });
    } else {
      const ollamaBaseUrl = configService.getOrThrow<string>('OLLAMA_BASE_URL');
      const embeddingModel = configService.getOrThrow<string>(
        'OLLAMA_EMBEDDING_MODEL',
      );
      this.embeddings = new OllamaEmbeddings({
        model: embeddingModel,
        baseUrl: ollamaBaseUrl,
      });
    }
  }

  async retrieveTopChunks(params: {
    subjectCode: string; // Đây là UUID từ FE
    chapterNo: number;
    topK?: number;
  }): Promise<RetrievedChunk[]> {
    const finalTopK = params.topK ?? 5;
    
    // 1. Fetch Metadata để lấy thông tin môn học
    const subject = await this.subjectsService.findOne(params.subjectCode);
    const chapter = await this.chaptersService.findOneByOrder(params.subjectCode, params.chapterNo);

    // 2. Xác định subject code thực tế (ví dụ: f67a... -> toan_6)
    const actualSubjectCode = subject 
      ? `${this.normalizeString(subject.name)}_${subject.grade}` 
      : params.subjectCode;

    this.logger.log(`Searching Qdrant for subject: ${actualSubjectCode}, chapter: ${params.chapterNo}`);

    // 3. Build Search Context
    const context = await this.queryBuilderService.buildSearchContext({
      subjectName: subject?.name ?? params.subjectCode,
      chapterTitle: chapter?.name ?? `Chương ${params.chapterNo}`,
      chapterNo: params.chapterNo,
      subjectCode: params.subjectCode,
      grade: subject?.grade,
    });

    // 4. Prepare search strings
    const searchStrings = [
      ...context.queries.map(q => q.text),
      ...context.hyde_passages
    ];

    // 5. Parallel Search with Correct Metadata Filter (subject, chapter)
    const filter = {
      must: [
        { key: 'subject', match: { value: actualSubjectCode } },
        { key: 'chapter', match: { value: params.chapterNo } },
      ],
    };

    const searchPromises = searchStrings.map(async (queryText) => {
      try {
        const embedding = await this.embeddings.embedQuery(queryText);
        return await this.qdrantClient.search(this.collectionName, {
          vector: embedding,
          limit: 10,
          with_payload: true,
          filter,
        });
      } catch (err) {
        this.logger.error(`Search failed for query: ${queryText}`, err.stack);
        return [];
      }
    });

    const results = await Promise.all(searchPromises);
    const allPoints = results.flat();

    // 6. Deduplication & Reranking
    const dedupedChunks = this.processResults(allPoints, chapter?.name ?? '');

    // 7. Return Final Top-K
    const finalChunks = dedupedChunks.slice(0, finalTopK);

    // 8. Save Trace
    saveRagTrace({
      params: { ...params, actualSubjectCode },
      searchQueries: searchStrings,
      rawHits: allPoints.map((p) => ({
        content: (p.payload?.content as string) || '',
        score: p.score,
        metadata: p.payload,
      })),
      finalChunks,
    });

    return finalChunks;
  }

  private processResults(points: any[], chapterTitle: string): RetrievedChunk[] {
    const chunkMap = new Map<string, { chunk: RetrievedChunk; score: number }>();

    for (const point of points) {
      const payload = point.payload as Record<string, unknown> | null;
      if (!payload || typeof payload.content !== 'string') continue;

      const content = payload.content.trim();
      const hash = crypto.createHash('md5').update(content).digest('hex');
      const currentScore = point.score ?? 0;

      let boostedScore = currentScore;
      if (chapterTitle && content.toLowerCase().includes(chapterTitle.toLowerCase())) {
        boostedScore += 0.05;
      }

      const existing = chunkMap.get(hash);
      if (!existing || boostedScore > existing.score) {
        chunkMap.set(hash, {
          score: boostedScore,
          chunk: {
            content,
            subject: typeof payload.subject === 'string' ? payload.subject : undefined,
            chapter: typeof payload.chapter === 'number' ? payload.chapter : undefined,
            lesson: typeof payload.lesson === 'number' ? payload.lesson : undefined,
            topic: typeof payload.topic === 'string' ? payload.topic : undefined,
          },
        });
      }
    }

    return Array.from(chunkMap.values())
      .sort((a, b) => b.score - a.score)
      .map(entry => entry.chunk);
  }

  /** Chuyển đổi chuỗi tiếng Việt sang không dấu để khớp với subject_code trong Qdrant */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}
