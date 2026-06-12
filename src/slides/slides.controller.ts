import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthRequest } from '../auth/interfaces/auth-request.interface';
import { SlidesService } from './slides.service';
import { SaveCompleteSlideDeckDto } from './dto/save-complete-slide-deck.dto';
import { UpdateSlideDeckDto } from './dto/update-slide-deck.dto';

@UseGuards(JwtAuthGuard)
@Controller('slide-decks')
export class SlidesController {
  constructor(private readonly slidesService: SlidesService) {}

  @Post('save')
  async save(@Body() dto: SaveCompleteSlideDeckDto, @Req() req: AuthRequest) {
    return this.slidesService.createComplete(req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: AuthRequest) {
    return this.slidesService.findAllByUser(req.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.slidesService.findOne(id, req.user.id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSlideDeckDto,
    @Req() req: AuthRequest,
  ) {
    return this.slidesService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthRequest) {
    await this.slidesService.remove(id, req.user.id);
    return { success: true };
  }
}
