import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Annotation, StateGraph } from '@langchain/langgraph';
import { ConfigService } from '@nestjs/config';
import {
  createQuestionLlm,
  type QuestionLlmProvider,
} from '../factories/create-question-llm.factory';
import { ChapterRetrievalService } from './chapter-retrieval.service';
import { QuestionPromptService } from './question-prompt.service';
import {
  DifficultyCounts,
  DifficultyDistribution,
  GeneratedQuestion,
  RetrievedChunk,
} from '../types/question.types';

// Annotation is used to define the schema of graph state
const QuestionGenerationState = Annotation.Root({
  subjectCode: Annotation<string>,
  chapterNo: Annotation<number>,
  numQuestions: Annotation<number>,
  difficultyDist: Annotation<DifficultyDistribution>,
  difficultyCounts: Annotation<DifficultyCounts>,
  chunks: Annotation<RetrievedChunk[]>,
  prompt: Annotation<string>,
  rawModelOutput: Annotation<string>,
  questions: Annotation<GeneratedQuestion[]>,
});

@Injectable()
export class QuestionGenerationGraphService {
  private readonly llm: BaseChatModel;
  private readonly llmProvider: QuestionLlmProvider;

  constructor(
    private readonly chapterRetrievalService: ChapterRetrievalService,
    private readonly questionPromptService: QuestionPromptService,
    private readonly configService: ConfigService,
  ) {
    const { llm, provider } = createQuestionLlm(configService);
    this.llm = llm;
    this.llmProvider = provider;
  }

  async run(input: {
    subjectCode: string;
    chapterNo: number;
    numQuestions: number;
    difficultyDist: DifficultyDistribution;
  }): Promise<GeneratedQuestion[]> {
    const normalizedDist =
      this.questionPromptService.normalizeDifficultyDistribution(
        input.difficultyDist,
      );
    const difficultyCounts =
      this.questionPromptService.allocateDifficultyCounts(
        input.numQuestions,
        normalizedDist,
      );

    const graph = new StateGraph(QuestionGenerationState)
      .addNode('retrieveContext', async (state) => {
        const chunks = await this.chapterRetrievalService.retrieveTopChunks({
          subjectCode: state.subjectCode,
          chapterNo: state.chapterNo,
          topK: 5,
        });
        return { chunks };
      })
      .addNode('buildPrompt', (state) => {
        const prompt = this.questionPromptService.buildPrompt({
          chunks: state.chunks ?? [],
          numQuestions: state.numQuestions,
          difficultyCounts: state.difficultyCounts,
          subjectCode: state.subjectCode,
          chapterNo: state.chapterNo,
        });
        return { prompt };
      })
      .addNode('generateQuestions', async (state) => {
        let content = '';
        try {
          const response = await this.llm.invoke(state.prompt);
          content =
            typeof response.content === 'string' ? response.content : '';
        } catch {
          throw new ServiceUnavailableException(
            this.llmProvider === 'gemini'
              ? 'Failed to generate questions from Gemini.'
              : 'Failed to generate questions from Ollama.',
          );
        }

        const parsed = this.parseAndValidateQuestions(
          content,
          state.numQuestions,
        );
        return {
          rawModelOutput: content,
          questions: parsed,
        };
      })
      .addEdge('__start__', 'retrieveContext')
      .addEdge('retrieveContext', 'buildPrompt')
      .addEdge('buildPrompt', 'generateQuestions')
      .addEdge('generateQuestions', '__end__')
      .compile();

    const result = await graph.invoke({
      subjectCode: input.subjectCode,
      chapterNo: input.chapterNo,
      numQuestions: input.numQuestions,
      difficultyDist: normalizedDist,
      difficultyCounts,
      chunks: [],
      prompt: '',
      rawModelOutput: '',
      questions: [],
    });

    return result.questions;
  }

  private parseAndValidateQuestions(
    modelOutput: string,
    expectedCount: number,
  ): GeneratedQuestion[] {
    const normalized = modelOutput
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(normalized);
    } catch {
      throw new ServiceUnavailableException(
        'The model returned invalid JSON for generated questions.',
      );
    }

    if (!Array.isArray(parsed)) {
      throw new ServiceUnavailableException(
        'The model response must be a JSON array of questions.',
      );
    }

    const validDifficulty = new Set(['easy', 'medium', 'hard']);
    const validated = parsed.map((item) => {
      if (typeof item !== 'object' || item === null) {
        throw new ServiceUnavailableException(
          'Question item must be an object.',
        );
      }

      const record = item as Record<string, unknown>;
      const question = record.question;
      const options = record.options;
      const answer = record.answer;
      const difficulty = record.difficulty;

      if (typeof question !== 'string' || !question.trim()) {
        throw new ServiceUnavailableException(
          'Question text is missing or invalid.',
        );
      }
      if (!Array.isArray(options) || options.length !== 4) {
        throw new ServiceUnavailableException(
          'Each question must include exactly 4 options.',
        );
      }
      if (
        !options.every(
          (opt) => typeof opt === 'string' && opt.trim().length > 0,
        )
      ) {
        throw new ServiceUnavailableException(
          'All options must be non-empty strings.',
        );
      }
      if (typeof answer !== 'string' || !answer.trim()) {
        throw new ServiceUnavailableException(
          'Question answer is missing or invalid.',
        );
      }
      if (typeof difficulty !== 'string' || !validDifficulty.has(difficulty)) {
        throw new ServiceUnavailableException(
          'Question difficulty must be easy, medium, or hard.',
        );
      }

      return {
        question,
        options: options as [string, string, string, string],
        answer,
        difficulty,
      } as GeneratedQuestion;
    });

    if (validated.length !== expectedCount) {
      throw new ServiceUnavailableException(
        `Expected ${expectedCount} generated questions, got ${validated.length}.`,
      );
    }

    return validated;
  }
}
