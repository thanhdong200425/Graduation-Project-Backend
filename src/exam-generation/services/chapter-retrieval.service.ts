import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { OllamaEmbeddings } from '@langchain/ollama';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { RetrievedChunk } from '../types/question.types';
import { ConfigService } from '@nestjs/config';
import { Embeddings } from '@langchain/core/embeddings';

@Injectable()
export class ChapterRetrievalService {
  private readonly qdrantClient: QdrantClient;
  private readonly collectionName: string;
  private readonly embeddings: Embeddings;

  constructor(private configService: ConfigService) {
    const qdrantUrl = configService.getOrThrow<string>('QDRANT_URL');
    const qdrantApiKey = configService.getOrThrow<string>('QDRANT_API_KEY');
    const modelType = (configService.get<string>('MODEL_TYPE') ?? 'OLLAMA')
      .trim()
      .toUpperCase();
    const useEmbeddingFromOllama = configService.getOrThrow<boolean>(
      'USE_EMBEDDING_FROM_OLLAMA',
    );

    this.collectionName = configService.getOrThrow('QDRANT_COLLECTION');
    this.qdrantClient = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantApiKey,
    });

    if (modelType === 'API') {
      const apiKey = configService.getOrThrow<string>('GEMINI_API_KEY');
      const model = useEmbeddingFromOllama
        ? configService.getOrThrow<string>('OLLAMA_EMBEDDING_MODEL')
        : (configService.get<string>('GEMINI_EMBEDDING_MODEL')?.trim() ??
          'text-embedding-004');

      if (useEmbeddingFromOllama) {
        const ollamaBaseUrl =
          configService.getOrThrow<string>('OLLAMA_BASE_URL');
        this.embeddings = new OllamaEmbeddings({
          model,
          baseUrl: ollamaBaseUrl,
        });
      } else {
        this.embeddings = new GoogleGenerativeAIEmbeddings({
          apiKey,
          modelName: model,
        });
      }
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
    subjectCode: string;
    chapterNo: number;
    topK?: number;
  }): Promise<RetrievedChunk[]> {
    const topK = params.topK ?? 5;
    const query = this.buildChapterQuery(params.subjectCode, params.chapterNo);

    let embedding: number[];
    try {
      embedding = await this.embeddings.embedQuery(query);
    } catch (e) {
      console.error('Embedding error:', e);
      throw new ServiceUnavailableException(
        'Failed to create embedding for chapter query.',
      );
    }

    try {
      const points = await this.qdrantClient.search(this.collectionName, {
        vector: embedding,
        limit: topK,
        with_payload: true,
        filter: {
          must: [
            {
              key: 'subject',
              match: { value: params.subjectCode },
            },
            {
              key: 'chapter',
              match: { value: params.chapterNo },
            },
          ],
        },
      });

      const chunks: RetrievedChunk[] = [];
      for (const point of points) {
        const payload = point.payload as Record<string, unknown> | null;
        if (!payload) {
          continue;
        }

        const content = payload.content;
        if (typeof content !== 'string' || !content.trim()) {
          continue;
        }

        chunks.push({
          content,
          subject:
            typeof payload.subject === 'string' ? payload.subject : undefined,
          chapter:
            typeof payload.chapter === 'number' ? payload.chapter : undefined,
          lesson:
            typeof payload.lesson === 'number' ? payload.lesson : undefined,
          topic: typeof payload.topic === 'string' ? payload.topic : undefined,
        });
      }

      return chunks;
    } catch {
      throw new ServiceUnavailableException(
        'Failed to search chapter content from Qdrant.',
      );
    }
  }

  async retrieveChunksByUploadIds(params: {
    uploadIds: string[];
    topK?: number;
    query?: string;
  }): Promise<RetrievedChunk[]> {
    const topK = params.topK ?? 10;
    const query = params.query;

    let embedding: number[];
    try {
      embedding = await this.embeddings.embedQuery(query ?? '');
    } catch (e) {
      console.error('Embedding error:', e);
      throw new ServiceUnavailableException(
        'Failed to create embedding for upload query.',
      );
    }

    try {
      const points = await this.qdrantClient.search(this.collectionName, {
        vector: embedding,
        limit: topK,
        with_payload: true,
        // filter: {
        //   should: params.uploadIds.map((id) => ({
        //     key: 'pdfUploadId',
        //     match: { value: id },
        //   })),
        // },
      });

      const chunks: RetrievedChunk[] = [];
      for (const point of points) {
        const payload = point.payload as Record<string, unknown> | null;
        if (!payload) continue;
        const content = payload.content;
        if (typeof content !== 'string' || !content.trim()) continue;
        chunks.push({
          content,
          subject:
            typeof payload.subject === 'string' ? payload.subject : undefined,
          chapter:
            typeof payload.chapter === 'number' ? payload.chapter : undefined,
        });
      }

      return chunks;
    } catch {
      throw new ServiceUnavailableException(
        'Failed to search upload content from Qdrant.',
      );
    }
  }

  private buildChapterQuery(subjectCode: string, chapterNo: number): string {
    return `Subject ${subjectCode}, chapter ${chapterNo}`;
  }
}
