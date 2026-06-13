import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Annotation, StateGraph } from '@langchain/langgraph';
import { ConfigService } from '@nestjs/config';
import {
  createQuestionLlm,
  type QuestionLlmProvider,
} from '../../exam-generation/factories/create-question-llm.factory';
import { ChapterRetrievalService } from '../../exam-generation/services/chapter-retrieval.service';
import type {
  ChunkScore,
  RetrievedChunk,
} from '../../exam-generation/types/question.types';
import { SlidePromptService } from './slide-prompt.service';
import { SlideValidationService } from './slide-validation.service';
import {
  DEFAULT_SLIDE_LAYOUT,
  SLIDE_LAYOUTS,
  type GeneratedSlide,
  type SlideDensity,
  type SlideLanguage,
  type SlideLayout,
} from '../types/slide.types';

export interface SlideGenerationUsage {
  promptTokens: number;
  completionTokens: number;
}

const SlideGenerationState = Annotation.Root({
  uploadIds: Annotation<string[]>,
  numSlides: Annotation<number>,
  density: Annotation<SlideDensity>,
  language: Annotation<SlideLanguage>,
  chunks: Annotation<RetrievedChunk[]>,
  prompt: Annotation<string>,
  rawModelOutput: Annotation<string>,
  slides: Annotation<GeneratedSlide[]>,
  query: Annotation<string>,
  chunksScore: Annotation<ChunkScore[]>,
  usage: Annotation<SlideGenerationUsage>,
});

@Injectable()
export class SlideGenerationGraphService {
  private readonly llm: BaseChatModel;
  private readonly llmProvider: QuestionLlmProvider;
  private readonly modelLabel: string;
  private readonly rerankServiceBaseUrl: string;

  constructor(
    private readonly chapterRetrievalService: ChapterRetrievalService,
    private readonly slidePromptService: SlidePromptService,
    private readonly configService: ConfigService,
    private readonly slideValidationService: SlideValidationService,
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
      numSlides: number;
      density: SlideDensity;
      language: SlideLanguage;
    },
    options?: {
      onProgress?: (progress: number) => Promise<void>;
    },
  ): Promise<{
    slides: GeneratedSlide[];
    usage: SlideGenerationUsage;
    model: string;
  }> {
    const report = async (pct: number) => {
      if (options?.onProgress) await options.onProgress(pct);
    };

    const graph = new StateGraph(SlideGenerationState)
      .addNode('buildQuery', async () => {
        const query =
          'key concepts, definitions, theories, and important facts suitable for lecture presentation slides';
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
        const prompt = this.slidePromptService.buildPrompt({
          chunks: state.chunks ?? [],
          numSlides: state.numSlides,
          density: state.density,
          language: state.language,
        });
        await report(60);
        return { prompt };
      })
      .addNode('generateSlides', async (state) => {
        let content = '';
        let usage: SlideGenerationUsage = {
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
          throw new ServiceUnavailableException(
            this.llmProvider === 'gemini'
              ? 'Failed to generate slides from Gemini.'
              : 'Failed to generate slides from Ollama.',
          );
        }

        const parsed = this.parseAndValidateSlides(content, state.numSlides);

        const { isValid, issues } =
          this.slideValidationService.validateSlides(parsed);
        if (!isValid) {
          const issueSummary = [...new Set(issues)].join(', ');
          console.error('[VALIDATION FAILED]', {
            numSlides: parsed.length,
            issues,
          });
          throw new ServiceUnavailableException(
            `Validation failed: [${issueSummary}] found in ${parsed.length} generated slides.`,
          );
        }

        await report(95);
        return { rawModelOutput: content, slides: parsed, usage };
      })
      .addEdge('__start__', 'buildQuery')
      .addEdge('buildQuery', 'retrieveContext')
      .addEdge('retrieveContext', 'gradeChunks')
      .addEdge('gradeChunks', 'buildPrompt')
      .addEdge('buildPrompt', 'generateSlides')
      .addEdge('generateSlides', '__end__')
      .compile();

    const result = await graph.invoke({
      uploadIds: input.uploadIds,
      numSlides: input.numSlides,
      density: input.density,
      language: input.language,
      chunks: [],
      prompt: '',
      rawModelOutput: '',
      slides: [],
      query: '',
      chunksScore: [],
      usage: { promptTokens: 0, completionTokens: 0 },
    });

    return {
      slides: result.slides,
      usage: result.usage,
      model: this.modelLabel,
    };
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

  private parseAndValidateSlides(
    modelOutput: string,
    expectedCount: number,
  ): GeneratedSlide[] {
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
        'The model returned invalid JSON for generated slides.',
      );
    }

    if (!Array.isArray(parsed)) {
      throw new ServiceUnavailableException(
        'The model response must be a JSON array of slides.',
      );
    }

    const validated = parsed.map((item) => {
      if (typeof item !== 'object' || item === null) {
        throw new ServiceUnavailableException('Slide item must be an object.');
      }

      const record = item as Record<string, unknown>;
      const { title, bullets, notes, layout } = record;

      if (typeof title !== 'string' || !title.trim()) {
        throw new ServiceUnavailableException(
          'Slide title is missing or invalid.',
        );
      }
      if (
        !Array.isArray(bullets) ||
        bullets.length === 0 ||
        !bullets.every((b) => typeof b === 'string' && b.trim().length > 0)
      ) {
        throw new ServiceUnavailableException(
          'Each slide must include a non-empty array of non-empty bullet strings.',
        );
      }

      const normalizedLayout: SlideLayout =
        typeof layout === 'string' &&
        (SLIDE_LAYOUTS as readonly string[]).includes(layout)
          ? (layout as SlideLayout)
          : DEFAULT_SLIDE_LAYOUT;

      return {
        layout: normalizedLayout,
        title: title.trim(),
        bullets: bullets.map((b) => (b as string).trim()),
        notes: typeof notes === 'string' ? notes.trim() : '',
      } satisfies GeneratedSlide;
    });

    if (validated.length !== expectedCount) {
      throw new ServiceUnavailableException(
        `Expected ${expectedCount} generated slides, got ${validated.length}.`,
      );
    }

    return validated;
  }
}
