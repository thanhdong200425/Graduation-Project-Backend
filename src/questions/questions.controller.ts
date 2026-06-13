import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QuestionsService } from './questions.service';

@UseGuards(JwtAuthGuard)
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  async create(@Body() createQuestionDto: CreateQuestionDto) {
    // Map the DTO `question` field to the Prisma `name` column.
    const { chapterId, chunkId, question, ...rest } = createQuestionDto;
    return this.questionsService.create({
      ...rest,
      name: question,
      chapter: { connect: { id: chapterId } },
      ...(chunkId ? { chunk: { connect: { id: chunkId } } } : {}),
    });
  }

  @Get()
  async findAll(@Query('chapterId') chapterId?: string) {
    if (chapterId) {
      return this.questionsService.findByChapter(chapterId);
    }
    return this.questionsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.questionsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateQuestionDto: UpdateQuestionDto,
  ) {
    const { chapterId, chunkId, question, ...rest } = updateQuestionDto;
    return this.questionsService.update(id, {
      ...rest,
      ...(question !== undefined ? { name: question } : {}),
      ...(chapterId ? { chapter: { connect: { id: chapterId } } } : {}),
      ...(chunkId ? { chunk: { connect: { id: chunkId } } } : {}),
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.questionsService.remove(id);
  }
}
