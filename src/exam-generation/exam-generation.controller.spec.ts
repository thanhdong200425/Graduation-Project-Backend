import { Test, TestingModule } from '@nestjs/testing';
import { ExamGenerationController } from './exam-generation.controller';
import { ExamGenerationService } from './exam-generation.service';

describe('ExamGenerationController', () => {
  let controller: ExamGenerationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExamGenerationController],
      providers: [
        {
          provide: ExamGenerationService,
          useValue: {
            generateQuestions: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ExamGenerationController>(ExamGenerationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
