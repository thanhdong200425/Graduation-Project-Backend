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
import { CreateExamQuestionDto } from './dto/create-exam-question.dto';
import { ReorderExamQuestionsDto } from './dto/reorder-exam-questions.dto';
import { ExamItemsService } from './exam-questions.service';

@UseGuards(JwtAuthGuard)
@Controller('exam-questions')
export class ExamQuestionsController {
  constructor(private readonly examQuestionsService: ExamItemsService) {}

  @Post()
  async create(@Body() createExamQuestionDto: CreateExamQuestionDto) {
    const { examId, questionId, orderIndex } = createExamQuestionDto;
    return this.examQuestionsService.create({
      orderIndex,
      exam: { connect: { id: examId } },
      question: { connect: { id: questionId } },
    });
  }

  @Get()
  async findByExam(@Query('examId') examId: string) {
    return this.examQuestionsService.findByExam(examId);
  }

  @Patch('reorder')
  async reorder(@Body() reorderDto: ReorderExamQuestionsDto) {
    const { examId, orderedItemIds } = reorderDto;
    return this.examQuestionsService.reorder(examId, orderedItemIds);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.examQuestionsService.remove(id);
  }

  @Delete('exam/:examId')
  async removeByExam(@Param('examId') examId: string) {
    return this.examQuestionsService.removeByExam(examId);
  }
}
