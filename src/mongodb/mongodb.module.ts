import { Module } from '@nestjs/common';
import { MongodbService } from './mongodb.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule],
  providers: [MongodbService],
  exports: [MongodbService],
})
export class MongodbModule {}
