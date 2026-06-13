import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SlideDeck } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SaveCompleteSlideDeckDto } from './dto/save-complete-slide-deck.dto';
import { UpdateSlideDeckDto } from './dto/update-slide-deck.dto';

@Injectable()
export class SlidesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Persist a reviewed deck. Slides are stored inline as a JSON column. */
  async createComplete(
    userId: string,
    dto: SaveCompleteSlideDeckDto,
  ): Promise<SlideDeck> {
    const { slides, subjectId, chapterId, ...meta } = dto;

    return this.prisma.slideDeck.create({
      data: {
        userId,
        title: meta.title,
        numSlides: meta.numSlides,
        density: meta.density,
        language: meta.language,
        slides: slides as unknown as Prisma.JsonArray,
        subjectId: subjectId ?? null,
        chapterId: chapterId ?? null,
      },
    });
  }

  /** Decks owned by this teacher only, newest first, with subject relation. */
  async findAllByUser(userId: string) {
    return this.prisma.slideDeck.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { subject: true },
    });
  }

  async findOne(id: string, userId: string): Promise<SlideDeck> {
    const deck = await this.prisma.slideDeck.findUnique({ where: { id } });
    if (!deck) throw new NotFoundException(`Slide deck ${id} not found`);
    if (deck.userId !== userId) {
      throw new ForbiddenException('You do not have access to this slide deck');
    }
    return deck;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateSlideDeckDto,
  ): Promise<SlideDeck> {
    await this.findOne(id, userId);
    return this.prisma.slideDeck.update({
      where: { id },
      data: { title: dto.title },
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id, userId);
    await this.prisma.slideDeck.delete({ where: { id } });
  }
}
