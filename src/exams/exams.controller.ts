import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ExamsService } from './exams.service';
import { SaveCompleteExamDto } from './dto/save-complete-exam.dto';

@UseGuards(JwtAuthGuard)
@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Post()
  async create(@Body() createExamDto: CreateExamDto) {
    const { subjectId, chapterId, ...rest } = createExamDto;
    return this.examsService.create({
      ...rest,
      ...(subjectId ? { subject: { connect: { id: subjectId } } } : {}),
      ...(chapterId ? { chapter: { connect: { id: chapterId } } } : {}),
    });
  }

  @Post('generate')
  async saveComplete(@Body() saveCompleteExamDto: SaveCompleteExamDto) {
    return this.examsService.createComplete(saveCompleteExamDto);
  }

  @Get()
  async findAll() {
    return this.examsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.examsService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateExamDto: UpdateExamDto) {
    return this.examsService.update(id, updateExamDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.examsService.remove(id);
  }
}
