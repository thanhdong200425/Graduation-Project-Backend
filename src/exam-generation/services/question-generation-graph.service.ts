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
  ChunkScore,
  DifficultyCounts,
  DifficultyDistribution,
  DifficultyLevel,
  GeneratedQuestion,
  RetrievedChunk,
} from '../types/question.types';
import { QuestionValidationService } from './question-validation.service';

export interface QuestionGenerationUsage {
  promptTokens: number;
  completionTokens: number;
}

const QuestionGenerationState = Annotation.Root({
  uploadIds: Annotation<string[]>,
  numQuestions: Annotation<number>,
  difficultyDist: Annotation<DifficultyDistribution>,
  difficultyCounts: Annotation<DifficultyCounts>,
  chunks: Annotation<RetrievedChunk[]>,
  prompt: Annotation<string>,
  rawModelOutput: Annotation<string>,
  questions: Annotation<GeneratedQuestion[]>,
  query: Annotation<string>,
  chunksScore: Annotation<ChunkScore[]>,
  usage: Annotation<QuestionGenerationUsage>,
});

@Injectable()
export class QuestionGenerationGraphService {
  private readonly llm: BaseChatModel;
  private readonly llmProvider: QuestionLlmProvider;
  private readonly modelLabel: string;
  private readonly rerankServiceBaseUrl: string;

  constructor(
    private readonly chapterRetrievalService: ChapterRetrievalService,
    private readonly questionPromptService: QuestionPromptService,
    private readonly configService: ConfigService,
    private readonly questionValidationService: QuestionValidationService,
  ) {
    const { llm, provider } = createQuestionLlm(configService);
    this.llm = llm;
    this.llmProvider = provider;
    this.modelLabel =
      provider === 'gemini'
        ? (configService.get<string>('GEMINI_MODEL')?.trim() ??
          'gemini-2.0-flash')
        : (configService.get<string>('OLLAMA_MODEL')?.trim() ?? 'ollama');
    this.rerankServiceBaseUrl =
      configService.getOrThrow<string>('FASTAPI_BASE_URL');
  }

  async run(
    input: {
      uploadIds: string[];
      numQuestions: number;
      difficultyDist: DifficultyDistribution;
    },
    options?: {
      onProgress?: (progress: number) => Promise<void>;
    },
  ): Promise<{
    questions: GeneratedQuestion[];
    usage: QuestionGenerationUsage;
    model: string;
  }> {
    const report = async (pct: number) => {
      if (options?.onProgress) await options.onProgress(pct);
    };

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
      .addNode('buildQuery', async () => {
        const query =
          'key concepts, definitions, theories, and important facts suitable for academic exam questions';
        await report(10);
        return { query };
      })
      .addNode('retrieveContext', async (state) => {
        const chunks =
          await this.chapterRetrievalService.retrieveChunksByUploadIds({
            uploadIds: state.uploadIds,
            topK: 10,
            query: state.query,
          });
        await report(30);
        return { chunks };
      })
      .addNode('gradeChunks', async (state) => {
        const response = await fetch(
          `${this.rerankServiceBaseUrl}/chunks-rerank`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: state.query,
              chunks: state.chunks ?? [],
            }),
          },
        );

        if (!response.ok) {
          throw new ServiceUnavailableException(
            `Failed to rerank chunks from ${this.rerankServiceBaseUrl}/chunks-rerank.`,
          );
        }

        const payload: unknown = await response.json();
        const rerankResults = this.extractRerankResults(payload);
        if (!rerankResults) {
          throw new ServiceUnavailableException(
            'The rerank service returned an invalid response.',
          );
        }

        const rerankedChunks = rerankResults
          .map((item) =>
            state.chunks?.find((chunk) => chunk.content === item.content),
          )
          .filter((chunk): chunk is RetrievedChunk => chunk !== undefined);

        const chunksScore = rerankResults.map((item) => ({
          chunkContent: item.content,
          score: item.score,
        }));

        await report(50);
        return { chunks: rerankedChunks, chunksScore };
      })
      .addNode('buildPrompt', async (state) => {
        const prompt = this.questionPromptService.buildPrompt({
          chunks: state.chunks ?? [],
          numQuestions: state.numQuestions,
          difficultyCounts: state.difficultyCounts,
        });
        await report(60);
        return { prompt };
      })
      .addNode('generateQuestions', async (state) => {
        let content = '';
        let usage: QuestionGenerationUsage = {
          promptTokens: 0,
          completionTokens: 0,
        };
        try {
          const response = await this.llm.invoke(state.prompt);
          content =
            typeof response.content === 'string' ? response.content : '';
          const meta = (
            response as {
              usage_metadata?: {
                input_tokens?: number;
                output_tokens?: number;
              };
            }
          ).usage_metadata;
          usage = {
            promptTokens: meta?.input_tokens ?? 0,
            completionTokens: meta?.output_tokens ?? 0,
          };
        } catch (error: unknown) {
          console.error('[CRITICAL ERROR] LLM execution failed:', error);
          if (
            typeof error === 'object' &&
            error !== null &&
            'response' in error
          ) {
            console.error(
              '[DETAILS] Response Data:',
              JSON.stringify(
                (error as { response?: { data?: unknown } }).response?.data,
                null,
                2,
              ),
            );
          }
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

        const { isValid, issues } =
          this.questionValidationService.validateQuestions(parsed);
        if (!isValid) {
          const uniqueIssues = [...new Set(issues)];
          const issueSummary = uniqueIssues.join(', ');
          console.error('[VALIDATION FAILED]', {
            numQuestions: parsed.length,
            issues: uniqueIssues,
          });
          throw new ServiceUnavailableException(
            `Validation failed: [${issueSummary}] found in ${parsed.length} generated questions.`,
          );
        }

        await report(85);
        return { rawModelOutput: content, questions: parsed, usage };
      })
      .addNode('classifyDifficulty', async (state) => {
        const payload = {
          questions: state.questions.map((q, i) => ({
            id: String(i),
            content: q.question,
          })),
        };

        const response = await fetch(
          `${this.rerankServiceBaseUrl}/predict/difficulty`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        );

        if (!response.ok) {
          throw new ServiceUnavailableException(
            `Failed to classify question difficulty from ${this.rerankServiceBaseUrl}/predict/difficulty.`,
          );
        }

        const data = this.extractDifficultyResults(
          (await response.json()) as unknown,
        );
        console.log({ data });
        if (!data) {
          throw new ServiceUnavailableException(
            'The difficulty classifier returned an invalid response.',
          );
        }

        const questions = state.questions.map((q, i) => ({
          ...q,
          difficulty: (data.find((r) => r.id === String(i))?.difficulty ??
            'medium') as DifficultyLevel,
        }));

        await report(95);
        return { questions };
      })
      .addEdge('__start__', 'buildQuery')
      .addEdge('buildQuery', 'retrieveContext')
      .addEdge('retrieveContext', 'gradeChunks')
      .addEdge('gradeChunks', 'buildPrompt')
      .addEdge('buildPrompt', 'generateQuestions')
      .addEdge('generateQuestions', 'classifyDifficulty')
      .addEdge('classifyDifficulty', '__end__')
      .compile();

    const result = await graph.invoke({
      uploadIds: input.uploadIds,
      numQuestions: input.numQuestions,
      difficultyDist: normalizedDist,
      difficultyCounts,
      chunks: [],
      prompt: '',
      rawModelOutput: '',
      questions: [],
      query: '',
      chunksScore: [],
      usage: { promptTokens: 0, completionTokens: 0 },
    });

    return {
      questions: result.questions,
      usage: result.usage,
      model: this.modelLabel,
    };
  }

  private extractDifficultyResults(
    payload: unknown,
  ): Array<{ id: string; difficulty: string }> | null {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('results' in payload) ||
      !Array.isArray((payload as { results?: unknown }).results)
    ) {
      return null;
    }

    const results = (
      payload as {
        results: Array<{ id?: unknown; difficulty?: unknown }>;
      }
    ).results;

    return results.filter(
      (item): item is { id: string; difficulty: string } =>
        typeof item.id === 'string' && typeof item.difficulty === 'string',
    );
  }

  private extractRerankResults(
    payload: unknown,
  ): Array<{ content: string; score: number }> | null {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('results' in payload) ||
      !Array.isArray((payload as { results?: unknown }).results)
    ) {
      return null;
    }

    const results = (
      payload as { results: Array<{ content?: unknown; score?: unknown }> }
    ).results;

    return results
      .filter(
        (item): item is { content: string; score: number } =>
          typeof item.content === 'string' && typeof item.score === 'number',
      )
      .map((item) => ({ content: item.content, score: item.score }));
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

    const validated = parsed.map((item) => {
      if (typeof item !== 'object' || item === null) {
        throw new ServiceUnavailableException(
          'Question item must be an object.',
        );
      }

      const record = item as Record<string, unknown>;
      const {
        question,
        options,
        answer,
        correctOptions: correctOptionsRaw,
      } = record;

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
      if (
        !Array.isArray(correctOptionsRaw) ||
        correctOptionsRaw.length !== 1 ||
        typeof correctOptionsRaw[0] !== 'string' ||
        !correctOptionsRaw[0].trim()
      ) {
        throw new ServiceUnavailableException(
          'Each question must include correctOptions as an array of exactly one non-empty string.',
        );
      }
      const correctOption = correctOptionsRaw[0];
      if (!options.includes(correctOption)) {
        throw new ServiceUnavailableException(
          'Each correctOptions entry must match one option verbatim.',
        );
      }

      return {
        question,
        options: options as [string, string, string, string],
        answer: answer.trim(),
        correctOptions: [correctOption],
        difficulty: 'easy' as DifficultyLevel,
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
