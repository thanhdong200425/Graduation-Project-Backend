import { Injectable } from '@nestjs/common';
import { GeneratedQuestion } from '../types/question.types';

export type QuestionValidationIssues =
  | 'OPTIONS_COUNT_NOT_4'
  | 'OPTIONS_EMPTY'
  | 'OPTIONS_DUPLICATE'
  | 'CORRECT_OPTIONS_NOT_IN_OPTIONS'
  | 'STEM_TOO_SHORT';

export interface QuestionValidationResult {
  isValid: boolean;
  issues: QuestionValidationIssues[];
}

@Injectable()
export class QuestionValidationService {
  /*
  @param questions - The questions to validate.
  @return The validation result.
  Run validators in order and return the first failing result.
  If all checks pass, returns isValid true with an empty issues array.
  */
  validateQuestions(questions: GeneratedQuestion[]): QuestionValidationResult {
    const optionsQuantityResult = this.validateOptionsQuantity(questions);
    if (!optionsQuantityResult.isValid) {
      return optionsQuantityResult;
    }
    const optionsEmptyResult = this.validateOptionsEmpty(questions);
    if (!optionsEmptyResult.isValid) {
      return optionsEmptyResult;
    }
    const optionsDuplicateResult = this.validateOptionsDuplicate(questions);
    if (!optionsDuplicateResult.isValid) {
      return optionsDuplicateResult;
    }
    const correctOptionsResult =
      this.validateCorrectOptionsInOptions(questions);
    if (!correctOptionsResult.isValid) {
      return correctOptionsResult;
    }
    const stemLengthResult = this.validateStemLength(questions);
    if (!stemLengthResult.isValid) {
      return stemLengthResult;
    }
    return {
      isValid: true,
      issues: [],
    };
  }

  /*
  @param questions - The questions to validate.
  @return The validation result.
  Validate the number of options in each question.
  Each question must have exactly 4 options.
  */
  private validateOptionsQuantity(
    questions: GeneratedQuestion[],
  ): QuestionValidationResult {
    const currentIssues: QuestionValidationIssues[] = [];
    for (const question of questions) {
      if (question.options.length !== 4) {
        currentIssues.push('OPTIONS_COUNT_NOT_4');
        console.log(
          `Current question ${question.question} doesn't have exactly 4 options.`,
        );
      }
    }
    return {
      isValid: currentIssues.length === 0,
      issues: currentIssues,
    };
  }

  /*
  @param questions - The questions to validate.
  @return The validation result.
  Validate that no option is empty or whitespace-only.
  Each option must contain non-whitespace characters after trim.
  */
  private validateOptionsEmpty(
    questions: GeneratedQuestion[],
  ): QuestionValidationResult {
    const currentIssues: QuestionValidationIssues[] = [];
    for (const question of questions) {
      if (question.options.some((option) => option.trim() === '')) {
        currentIssues.push('OPTIONS_EMPTY');
        console.log(`Current question ${question.question} has empty options.`);
      }
    }
    return {
      isValid: currentIssues.length === 0,
      issues: currentIssues,
    };
  }

  /*
  @param questions - The questions to validate.
  @return The validation result.
  Validate that no option text repeats after trim and lowercase normalization.
  Duplicates are tracked across the entire question list.
  */
  private validateOptionsDuplicate(
    questions: GeneratedQuestion[],
  ): QuestionValidationResult {
    const currentIssues: QuestionValidationIssues[] = [];
    for (const [index, question] of questions.entries()) {
      const optionSet = new Set<string>();
      for (const option of question.options) {
        const normalized = option.trim();
        if (optionSet.has(normalized)) {
          currentIssues.push('OPTIONS_DUPLICATE');
          console.log(
            `Question ${index + 1} ("${question.question.substring(0, 50)}...") has duplicate options.`,
          );
        }
        optionSet.add(normalized);
      }
    }
    return {
      isValid: currentIssues.length === 0,
      issues: currentIssues,
    };
  }

  /*
  @param questions - The questions to validate.
  @return The validation result.
  Validate that each string in correctOptions appears exactly in the options array.
  Matching uses strict equality.
  */
  private validateCorrectOptionsInOptions(
    questions: GeneratedQuestion[],
  ): QuestionValidationResult {
    const currentIssues: QuestionValidationIssues[] = [];
    questions.forEach((question) => {
      for (const co of question.correctOptions) {
        if (typeof co !== 'string' || !question.options.includes(co)) {
          currentIssues.push('CORRECT_OPTIONS_NOT_IN_OPTIONS');
          console.log(
            `Current question ${question.question} has a correct option not listed in options.`,
          );
          console.log(
            `Correct options: ${JSON.stringify(question.correctOptions)}`,
          );
          console.log(`Options: ${JSON.stringify(question.options)}`);
          break;
        }
      }
    });
    return {
      isValid: currentIssues.length === 0,
      issues: currentIssues,
    };
  }

  /*
  @param questions - The questions to validate.
  @return The validation result.
  Validate the length of each question stem.
  Each stem must be at least 3 characters long.
  */
  private validateStemLength(
    questions: GeneratedQuestion[],
  ): QuestionValidationResult {
    const currentIssues: QuestionValidationIssues[] = [];
    for (const question of questions) {
      if (question.question.length < 3) {
        currentIssues.push('STEM_TOO_SHORT');
        console.log(`Current question ${question.question} has a short stem.`);
      }
    }
    return {
      isValid: currentIssues.length === 0,
      issues: currentIssues,
    };
  }
}
