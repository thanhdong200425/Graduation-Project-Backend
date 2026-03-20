import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { OllamaEmbeddings } from '@langchain/ollama';
import { QdrantClient } from '@qdrant/js-client-rest';
import { RetrievedChunk } from '../types/question.types';

@Injectable()
export class ChapterRetrievalService {
  private readonly qdrantClient: QdrantClient;
  private readonly collectionName: string;
  private readonly embeddings: OllamaEmbeddings;

  constructor() {
    const qdrantUrl = process.env.QDRANT_URL ?? 'http://localhost:6333';
    const qdrantApiKey = process.env.QDRANT_API_KEY;
    const ollamaBaseUrl =
      process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    const embeddingModel = process.env.OLLAMA_EMBED_MODEL ?? 'all-minilm';

    this.collectionName = process.env.QDRANT_COLLECTION ?? 'textbook_chunks';
    this.qdrantClient = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantApiKey,
    });
    this.embeddings = new OllamaEmbeddings({
      model: embeddingModel,
      baseUrl: ollamaBaseUrl,
    });
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
    } catch {
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

  private buildChapterQuery(subjectCode: string, chapterNo: number): string {
    return `Subject ${subjectCode}, chapter ${chapterNo}`;
  }
}
