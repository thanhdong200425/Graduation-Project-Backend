import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { OllamaEmbeddings } from '@langchain/ollama';
import { Embeddings } from '@langchain/core/embeddings';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Collection, MongoClient } from 'mongodb';
import { PDFParse } from 'pdf-parse';
import { PrismaService } from '../../prisma/prisma.service';

export interface ParsedPdfResult {
  pdfUploadId: string;
  text: string;
  numPages: number;
}

@Injectable()
export class PdfPipelineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PdfPipelineService.name);

  private readonly qdrantClient: QdrantClient;
  private readonly collectionName: string;
  private readonly embeddings: Embeddings;

  private mongoClient!: MongoClient;
  private mongoCollection!: Collection;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.qdrantClient = new QdrantClient({
      url: config.getOrThrow<string>('QDRANT_URL'),
      apiKey: config.getOrThrow<string>('QDRANT_API_KEY'),
    });
    this.collectionName = config.getOrThrow<string>('QDRANT_COLLECTION');

    const modelType = (config.get<string>('MODEL_TYPE') ?? 'OLLAMA')
      .trim()
      .toUpperCase();

    if (modelType === 'API') {
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
    const uri = this.config.getOrThrow<string>('MONGO_URI');
    const dbName = this.config.getOrThrow<string>('MONGO_INITDB_DATABASE');
    const collectionName = this.config.getOrThrow<string>('MONGO_COLLECTION');

    // Ensure MongoDB is initialized
    this.mongoClient = new MongoClient(uri);
    await this.mongoClient.connect();
    this.mongoCollection = this.mongoClient
      .db(dbName)
      .collection(collectionName);
    this.logger.log('MongoDB connected');

    // Ensure Qdrant is initialized
  }

  async onModuleDestroy() {
    await this.mongoClient?.close();
    this.logger.log('MongoDB disconnected');
  }

  async parsePdf(
    pdfUploadId: string,
    chapterId: string | null,
  ): Promise<ParsedPdfResult> {
    const record = await this.prisma.pdfUpload.findUniqueOrThrow({
      where: { id: pdfUploadId },
    });

    const chapter = chapterId
      ? await this.prisma.chapter.findUniqueOrThrow({
          where: { id: chapterId },
          include: { subject: true },
        })
      : null;

    try {
      const pdfParsed = new PDFParse({ url: record.filePath });
      const pdfText = await pdfParsed.getText();

      const cleanedData = await this.cleanParsedData({
        pdfUploadId,
        text: pdfText.text,
        numPages: pdfText.pages.length,
      });

      console.log('Chunking text');
      const chunks = this.chunkText(cleanedData.text);
      console.log('Created chunk text');

      await this.saveChunksToMongo(chunks, chapterId ?? '', pdfUploadId);
      await this.embedAndUpsert(
        chunks,
        chapter?.subject.name ?? '',
        chapter?.orderIndex ?? 0,
      );

      await this.prisma.pdfUpload.update({
        where: { id: pdfUploadId },
        data: { status: 'INDEXED' },
      });

      return cleanedData;
    } catch (error) {
      this.logger.error(`Failed to process PDF ${record.fileName}`, error);
      throw error;
    }
  }

  private chunkText(text: string): string[] {
    const chunkSize = 1000;
    const overlap = 200;
    const step = chunkSize - overlap;
    const chunks: string[] = [];

    for (let start = 0; start < text.length; start += step) {
      const chunk = text.slice(start, start + chunkSize).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
    }

    return chunks;
  }

  private async saveChunksToMongo(
    chunks: string[],
    chapterId: string,
    pdfUploadId: string,
  ): Promise<void> {
    try {
      console.log('Saving chunk to MongoDB');
      const docs = chunks.map((content, index) => ({
        chapterId,
        pdfUploadId,
        chunkIndex: index,
        content,
        createdAt: new Date(),
      }));

      await this.mongoCollection.insertMany(docs);
      console.log('Saved chunks to MongoDB');
    } catch (error) {
      console.log('Error in saving chunks to mongoDB()');
      throw error;
    }
  }

  private async embedAndUpsert(
    chunks: string[],
    subjectName: string,
    chapterIndex: number,
  ): Promise<void> {
    const points: {
      id: string;
      vector: number[];
      payload: Record<string, unknown>;
    }[] = [];

    try {
      console.log('Embedding');
      for (const chunk of chunks) {
        console.log('Creating vector');
        const vector = await this.embeddings.embedQuery(chunk);
        console.log('Vector: ', JSON.stringify(vector));
        points.push({
          id: crypto.randomUUID(),
          vector,
          payload: {
            content: chunk,
            subject: subjectName,
            chapter: chapterIndex,
          },
        });
      }

      await this.qdrantClient.upsert(this.collectionName, { points });
      console.log('Saved vector to qdrant');
    } catch (error) {
      console.log('Error in embeding and saving vectors to Qdrant');
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async cleanParsedData(
    parsedData: ParsedPdfResult,
  ): Promise<ParsedPdfResult> {
    const cleanedText = parsedData.text
      .replace(/^\s*-?\s*\d+\s*-?\s*$/gm, '')
      .replace(/^\s*(Page|Trang)\s+\d+\s*$/gim, '')
      .replace(/^.{1,20}$/gm, (line) => (line.trim().length < 5 ? '' : line))
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[^\S\n]+/g, ' ')
      .trim();

    return {
      ...parsedData,
      text: cleanedText,
    };
  }
}
