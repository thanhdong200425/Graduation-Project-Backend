import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { OllamaEmbeddings } from '@langchain/ollama';
import { Embeddings } from '@langchain/core/embeddings';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantUpsertPayload } from './qdrant.interface';

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);

  private readonly client: QdrantClient;
  private readonly collectionName: string;
  private readonly embeddings: Embeddings;

  constructor(config: ConfigService) {
    this.client = new QdrantClient({
      url: config.getOrThrow<string>('QDRANT_URL'),
      apiKey: config.getOrThrow<string>('QDRANT_API_KEY'),
    });
    this.collectionName = config.getOrThrow<string>('QDRANT_COLLECTION');

    const modelType = (config.get<string>('MODEL_TYPE') ?? 'OLLAMA')
      .trim()
      .toUpperCase();
    const useEmbedingFromOllama = config.getOrThrow<boolean>(
      'USE_EMBEDDING_FROM_OLLAMA',
    );

    if (modelType === 'API' && !useEmbedingFromOllama) {
      this.embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: config.getOrThrow<string>('GEMINI_API_KEY'),
        modelName:
          config.get<string>('GEMINI_EMBEDDING_MODEL')?.trim() ??
          'text-embedding-004',
      });
    } else {
      this.embeddings = new OllamaEmbeddings({
        model: config.getOrThrow<string>('OLLAMA_EMBEDDING_MODEL'),
        baseUrl: config.getOrThrow<string>('OLLAMA_BASE_URL'),
      });
    }
  }

  async onModuleInit() {
    try {
      const { exists } = await this.client.collectionExists(
        this.collectionName,
      );
      if (!exists) {
        // This line is just specify the dimension of the vector since our server supports dynamic models (Gemini or Ollama)
        const example = await this.embeddings.embedQuery('example');
        await this.client.createCollection(this.collectionName, {
          vectors: { size: example.length, distance: 'Cosine' },
        });
        this.logger.log(
          `Created Qdrant collection "${this.collectionName}" (dim=${example.length})`,
        );
      } else {
        this.logger.log(
          `Qdrant collection "${this.collectionName}" already exists`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to initialise Qdrant collection', error);
      throw error;
    }
  }

  async embedAndUpsert(payload: QdrantUpsertPayload): Promise<void> {
    const { chunks, subjectName, chapterIndex, pdfUploadId } = payload;
    const points: {
      id: string;
      vector: number[];
      payload: Record<string, unknown>;
    }[] = [];

    try {
      const existingCount = await this.client.count(this.collectionName, {
        filter: {
          must: [{ key: 'pdfUploadId', match: { value: pdfUploadId } }],
        },
      });

      if (existingCount.count > 0) {
        this.logger.log(
          'These vectors have already been upserted to Qdrant, skipping embedding and upserting',
        );
        return;
      }

      for (const chunk of chunks) {
        const vector = await this.embeddings.embedQuery(chunk);
        points.push({
          id: crypto.randomUUID(),
          vector,
          payload: {
            content: chunk,
            subject: subjectName,
            chapter: chapterIndex,
            pdfUploadId,
          },
        });
      }

      await this.client.upsert(this.collectionName, { points });
    } catch (error) {
      this.logger.error('Failed to embed and upsert vectors to Qdrant', error);
      throw error;
    }
  }

  async deleteVectorsByUploadId(pdfUploadId: string): Promise<void> {
    await this.client.delete(this.collectionName, {
      filter: {
        must: [{ key: 'pdfUploadId', match: { value: pdfUploadId } }],
      },
    });
  }
}
