import { Controller, Get, Param, Query } from '@nestjs/common';
import { ChaptersService } from './chapters.service';

@Controller('chapters')
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  @Get()
  async find(@Query('subject_id') subjectId?: string) {
    if (subjectId) {
      return this.chaptersService.findBySubject(subjectId);
    }
    return this.chaptersService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.chaptersService.findOne(id);
  }
}
