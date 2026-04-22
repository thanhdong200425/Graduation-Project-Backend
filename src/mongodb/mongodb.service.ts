import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Collection, MongoClient } from 'mongodb';
import { MongoDBChunkPayload, MongoDBChunkResponse } from './mongodb.interface';

@Injectable()
export class MongodbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongodbService.name);

  private mongoClient!: MongoClient;
  private mongoCollection!: Collection;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const uri = this.config.getOrThrow<string>('MONGO_URI');
    const dbName = this.config.getOrThrow<string>('MONGO_INITDB_DATABASE');
    const collectionName = this.config.getOrThrow<string>('MONGO_COLLECTION');

    try {
      this.mongoClient = new MongoClient(uri);
      await this.mongoClient.connect();
      this.mongoCollection = this.mongoClient
        .db(dbName)
        .collection(collectionName);

      this.logger.log('MongoDB connected');
    } catch (error) {
      this.logger.error('Failed to connect to MongoDB');
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.mongoClient) {
      try {
        await this.mongoClient.close();
        this.logger.log('MongoDB connection closed');
      } catch (error) {
        this.logger.error('Failed to close MongoDB connection');
        throw error;
      }
    }
  }

  async saveChunksToMongo(
    payload: MongoDBChunkPayload,
  ): Promise<MongoDBChunkResponse> {
    const { chunks, chapterId, pdfUploadId } = payload;
    try {
      const docs = chunks.map((content, index) => ({
        chapterId,
        pdfUploadId,
        chunkIndex: index,
        content,
        createdAt: new Date(),
      }));

      await this.mongoCollection.insertMany(docs);
      return { success: true };
    } catch (error) {
      console.log('Error in saving chunks to mongoDB(): ', error);
      return { success: false };
    }
  }
}
