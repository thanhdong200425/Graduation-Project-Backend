import { Test, TestingModule } from '@nestjs/testing';
import {
  QuestionValidationIssues,
  QuestionValidationService,
} from './question-validation.service';
import { GeneratedQuestion } from '../types/question.types';

describe('QuestionValidationService', () => {
  let service: QuestionValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QuestionValidationService],
    }).compile();

    service = module.get<QuestionValidationService>(QuestionValidationService);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const baseQuestion: GeneratedQuestion = {
    question:
      'Trong các phát biểu sau về dao động điều hòa, phát biểu nào đúng?',
    options: [
      'Biên độ dao động phụ thuộc cách chọn gốc thời gian.',
      'Pha ban đầu phụ thuộc cách chọn gốc thời gian.',
      'Tần số góc của dao động phụ thuộc cách chọn gốc thời gian.',
      'Năng lượng dao động phụ thuộc cách chọn gốc thời gian.',
    ],
    answer:
      'Pha ban đầu φ phụ thuộc gốc thời gian, khác với biên độ và tần số góc.',
    correctOptions: ['Pha ban đầu phụ thuộc cách chọn gốc thời gian.'],
    difficulty: 'medium',
  };

  describe('validateOptionsQuantity', () => {
    const validateOptionsQuantity = (questions: GeneratedQuestion[]) =>
      (
        service as unknown as {
          validateOptionsQuantity(q: GeneratedQuestion[]): {
            isValid: boolean;
            issues: QuestionValidationIssues[];
          };
        }
      ).validateOptionsQuantity(questions);

    it('returns valid when every question has exactly 4 options', () => {
      const questions: GeneratedQuestion[] = [baseQuestion];

      const result = validateOptionsQuantity(questions);

      expect(result).toEqual({
        isValid: true,
        issues: [],
      });
      expect(console.log).not.toHaveBeenCalled();
    });

    it('returns OPTIONS_COUNT_NOT_4 when options length is not 4', () => {
      const questionWithThreeOptions = {
        ...baseQuestion,
        options: [
          'Biên độ dao động phụ thuộc cách chọn gốc thời gian.',
          'Pha ban đầu phụ thuộc cách chọn gốc thời gian.',
          'Tần số góc của dao động phụ thuộc cách chọn gốc thời gian.',
        ],
      } as unknown as GeneratedQuestion;

      const result = validateOptionsQuantity([questionWithThreeOptions]);

      expect(result).toEqual({
        isValid: false,
        issues: ['OPTIONS_COUNT_NOT_4'],
      });
      expect(console.log).toHaveBeenCalledWith(
        `Current question ${questionWithThreeOptions.question} doesn't have exactly 4 options.`,
      );
    });

    it('accumulates one issue per question with wrong option count', () => {
      const q1 = {
        ...baseQuestion,
        options: ['A', 'B'],
      } as unknown as GeneratedQuestion;
      const q2 = {
        ...baseQuestion,
        question: 'Second stem?',
        options: ['X', 'Y', 'Z', 'W', 'Extra'],
      } as unknown as GeneratedQuestion;

      const result = validateOptionsQuantity([q1, q2]);

      expect(result.isValid).toBe(false);
      expect(result.issues).toEqual([
        'OPTIONS_COUNT_NOT_4',
        'OPTIONS_COUNT_NOT_4',
      ]);
    });

    it('returns valid for an empty question list', () => {
      const result = validateOptionsQuantity([]);

      expect(result).toEqual({
        isValid: true,
        issues: [],
      });
    });
  });

  describe('validateOptionsEmpty', () => {
    const validateOptionsEmpty = (questions: GeneratedQuestion[]) =>
      (
        service as unknown as {
          validateOptionsEmpty(q: GeneratedQuestion[]): {
            isValid: boolean;
            issues: QuestionValidationIssues[];
          };
        }
      ).validateOptionsEmpty(questions);

    it('returns valid when no option is empty or whitespace-only', () => {
      const result = validateOptionsEmpty([baseQuestion]);

      expect(result).toEqual({
        isValid: true,
        issues: [],
      });
      expect(console.log).not.toHaveBeenCalled();
    });

    it('returns OPTIONS_EMPTY when an option is an empty string', () => {
      const questionWithEmptyOption: GeneratedQuestion = {
        ...baseQuestion,
        options: [
          '',
          'Pha ban đầu phụ thuộc cách chọn gốc thời gian.',
          'Tần số góc của dao động phụ thuộc cách chọn gốc thời gian.',
          'Năng lượng dao động phụ thuộc cách chọn gốc thời gian.',
        ],
      };

      const result = validateOptionsEmpty([questionWithEmptyOption]);

      expect(result).toEqual({
        isValid: false,
        issues: ['OPTIONS_EMPTY'],
      });
      expect(console.log).toHaveBeenCalledWith(
        `Current question ${questionWithEmptyOption.question} has empty options.`,
      );
    });

    it('returns OPTIONS_EMPTY when an option is only whitespace', () => {
      const questionWithWhitespaceOption: GeneratedQuestion = {
        ...baseQuestion,
        options: [
          'Biên độ dao động phụ thuộc cách chọn gốc thời gian.',
          '  \t  ',
          'Tần số góc của dao động phụ thuộc cách chọn gốc thời gian.',
          'Năng lượng dao động phụ thuộc cách chọn gốc thời gian.',
        ],
      };

      const result = validateOptionsEmpty([questionWithWhitespaceOption]);

      expect(result).toEqual({
        isValid: false,
        issues: ['OPTIONS_EMPTY'],
      });
      expect(console.log).toHaveBeenCalledWith(
        `Current question ${questionWithWhitespaceOption.question} has empty options.`,
      );
    });

    it('accumulates one issue per question that has an empty option', () => {
      const q1: GeneratedQuestion = {
        ...baseQuestion,
        options: ['', 'B', 'C', 'D'],
      };
      const q2: GeneratedQuestion = {
        ...baseQuestion,
        question: 'Câu hỏi thứ hai?',
        options: ['A', 'B', 'C', ''],
      };

      const result = validateOptionsEmpty([q1, q2]);

      expect(result.isValid).toBe(false);
      expect(result.issues).toEqual(['OPTIONS_EMPTY', 'OPTIONS_EMPTY']);
    });

    it('returns valid for an empty question list', () => {
      const result = validateOptionsEmpty([]);

      expect(result).toEqual({
        isValid: true,
        issues: [],
      });
    });
  });

  describe('validateOptionsDuplicate', () => {
    const validateOptionsDuplicate = (questions: GeneratedQuestion[]) =>
      (
        service as unknown as {
          validateOptionsDuplicate(q: GeneratedQuestion[]): {
            isValid: boolean;
            issues: QuestionValidationIssues[];
          };
        }
      ).validateOptionsDuplicate(questions);

    it('returns valid when all options are unique (normalized)', () => {
      const result = validateOptionsDuplicate([baseQuestion]);

      expect(result).toEqual({
        isValid: true,
        issues: [],
      });
      expect(console.log).not.toHaveBeenCalled();
    });

    it('returns OPTIONS_DUPLICATE when two options are identical in the same question', () => {
      const dupText = 'Pha ban đầu phụ thuộc cách chọn gốc thời gian.';
      const questionWithDuplicate: GeneratedQuestion = {
        ...baseQuestion,
        options: [
          'Biên độ dao động phụ thuộc cách chọn gốc thời gian.',
          dupText,
          dupText,
          'Năng lượng dao động phụ thuộc cách chọn gốc thời gian.',
        ],
      };

      const result = validateOptionsDuplicate([questionWithDuplicate]);

      expect(result).toEqual({
        isValid: false,
        issues: ['OPTIONS_DUPLICATE'],
      });
      expect(console.log).toHaveBeenCalledWith(
        `Current question ${questionWithDuplicate.question} has duplicate options.`,
      );
    });

    it('treats options as duplicate when they match after trim and lowercase', () => {
      const questionWithCaseDup: GeneratedQuestion = {
        ...baseQuestion,
        options: ['Alpha', '  ALPHA  ', 'Beta', 'Gamma'],
      };

      const result = validateOptionsDuplicate([questionWithCaseDup]);

      expect(result).toEqual({
        isValid: false,
        issues: ['OPTIONS_DUPLICATE'],
      });
    });

    it('flags each additional occurrence that collides with the global seen set', () => {
      const q: GeneratedQuestion = {
        ...baseQuestion,
        options: ['X', 'X', 'X', 'Y'],
      };

      const result = validateOptionsDuplicate([q]);

      expect(result.isValid).toBe(false);
      expect(result.issues).toEqual(['OPTIONS_DUPLICATE', 'OPTIONS_DUPLICATE']);
    });

    it('detects duplicate when a later question repeats a normalized option from an earlier question', () => {
      const shared = 'shared option text';
      const q1: GeneratedQuestion = {
        ...baseQuestion,
        options: [shared, 'a', 'b', 'c'],
      };
      const q2: GeneratedQuestion = {
        ...baseQuestion,
        question: 'Câu khác?',
        options: [shared, 'd', 'e', 'f'],
      };

      const result = validateOptionsDuplicate([q1, q2]);

      expect(result).toEqual({
        isValid: false,
        issues: ['OPTIONS_DUPLICATE'],
      });
      expect(console.log).toHaveBeenCalledWith(
        `Current question ${q2.question} has duplicate options.`,
      );
    });

    it('returns valid for an empty question list', () => {
      const result = validateOptionsDuplicate([]);

      expect(result).toEqual({
        isValid: true,
        issues: [],
      });
    });
  });

  describe('validateCorrectOptionsInOptions', () => {
    const validateCorrectOptionsInOptions = (questions: GeneratedQuestion[]) =>
      (
        service as unknown as {
          validateCorrectOptionsInOptions(q: GeneratedQuestion[]): {
            isValid: boolean;
            issues: QuestionValidationIssues[];
          };
        }
      ).validateCorrectOptionsInOptions(questions);

    it('returns valid when each correctOptions entry is one of the options', () => {
      const result = validateCorrectOptionsInOptions([baseQuestion]);

      expect(result).toEqual({
        isValid: true,
        issues: [],
      });
      expect(console.log).not.toHaveBeenCalled();
    });

    it('returns CORRECT_OPTIONS_NOT_IN_OPTIONS when correctOptions is not in the options array', () => {
      const q: GeneratedQuestion = {
        ...baseQuestion,
        correctOptions: ['Đáp án không có trong danh sách.'],
      };

      const result = validateCorrectOptionsInOptions([q]);

      expect(result).toEqual({
        isValid: false,
        issues: ['CORRECT_OPTIONS_NOT_IN_OPTIONS'],
      });
      expect(console.log).toHaveBeenCalledWith(
        `Current question ${q.question} has a correct option not listed in options.`,
      );
    });

    it('uses strict equality: correctOptions must match an option exactly', () => {
      const correctOption = 'Pha ban đầu phụ thuộc cách chọn gốc thời gian.';
      const q: GeneratedQuestion = {
        ...baseQuestion,
        correctOptions: [`  ${correctOption}  `],
      };

      const result = validateCorrectOptionsInOptions([q]);

      expect(result).toEqual({
        isValid: false,
        issues: ['CORRECT_OPTIONS_NOT_IN_OPTIONS'],
      });
    });

    it('accumulates one issue per question whose correctOptions are not in options', () => {
      const q1: GeneratedQuestion = {
        ...baseQuestion,
        correctOptions: ['Wrong 1'],
      };
      const q2: GeneratedQuestion = {
        ...baseQuestion,
        question: 'Câu hỏi khác đủ dài để qua stem?',
        correctOptions: ['Wrong 2'],
      };

      const result = validateCorrectOptionsInOptions([q1, q2]);

      expect(result.isValid).toBe(false);
      expect(result.issues).toEqual([
        'CORRECT_OPTIONS_NOT_IN_OPTIONS',
        'CORRECT_OPTIONS_NOT_IN_OPTIONS',
      ]);
    });

    it('returns valid for an empty question list', () => {
      const result = validateCorrectOptionsInOptions([]);

      expect(result).toEqual({
        isValid: true,
        issues: [],
      });
    });
  });

  describe('validateStemLength', () => {
    const validateStemLength = (questions: GeneratedQuestion[]) =>
      (
        service as unknown as {
          validateStemLength(q: GeneratedQuestion[]): {
            isValid: boolean;
            issues: QuestionValidationIssues[];
          };
        }
      ).validateStemLength(questions);

    it('returns valid when the stem length is at least 3 characters', () => {
      const result = validateStemLength([baseQuestion]);

      expect(result).toEqual({
        isValid: true,
        issues: [],
      });
    });

    it('returns STEM_TOO_SHORT when the stem has fewer than 3 characters', () => {
      const q: GeneratedQuestion = {
        ...baseQuestion,
        question: 'ab',
      };

      const result = validateStemLength([q]);

      expect(result).toEqual({
        isValid: false,
        issues: ['STEM_TOO_SHORT'],
      });
    });

    it('accepts a stem of exactly 3 characters', () => {
      const q: GeneratedQuestion = {
        ...baseQuestion,
        question: 'abc',
      };

      const result = validateStemLength([q]);

      expect(result).toEqual({
        isValid: true,
        issues: [],
      });
    });

    it('accumulates one issue per question with a short stem', () => {
      const q1: GeneratedQuestion = {
        ...baseQuestion,
        question: '',
      };
      const q2: GeneratedQuestion = {
        ...baseQuestion,
        question: 'ab',
      };

      const result = validateStemLength([q1, q2]);

      expect(result.isValid).toBe(false);
      expect(result.issues).toEqual(['STEM_TOO_SHORT', 'STEM_TOO_SHORT']);
    });

    it('returns valid for an empty question list', () => {
      const result = validateStemLength([]);

      expect(result).toEqual({
        isValid: true,
        issues: [],
      });
    });
  });
});
