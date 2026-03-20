import { Test, TestingModule } from '@nestjs/testing';
import { ExamGenerationService } from './exam-generation.service';
import { QuestionGenerationGraphService } from './services/question-generation-graph.service';

describe('ExamGenerationService', () => {
  let service: ExamGenerationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExamGenerationService,
        {
          provide: QuestionGenerationGraphService,
          useValue: {
            run: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ExamGenerationService>(ExamGenerationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
