import { ConfigService } from '@nestjs/config';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOllama } from '@langchain/ollama';
import { ChatGoogle } from '@langchain/google';

export type QuestionLlmProvider = 'ollama' | 'gemini';

function parseTemperature(raw: unknown, fallback = 0.2): number {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const n = typeof raw === 'string' ? Number(raw) : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Builds the chat model for question generation.
 * - `MODEL_TYPE=API` → Gemini via `@langchain/google-genai` (uses `GEMINI_API_KEY`).
 * - Otherwise → local Ollama (`OLLAMA_*`).
 */
export function createQuestionLlm(configService: ConfigService): {
  llm: BaseChatModel;
  provider: QuestionLlmProvider;
} {
  const modelType = (configService.get<string>('MODEL_TYPE') ?? 'OLLAMA')
    .trim()
    .toUpperCase();

  if (modelType === 'API') {
    const apiKey = configService.getOrThrow<string>('GEMINI_API_KEY');
    const model =
      configService.get<string>('GEMINI_MODEL')?.trim() ?? 'gemini-2.0-flash';

    const llm = new ChatGoogle({
      apiKey,
      model,
    });

    return { llm, provider: 'gemini' };
  }

  const model = configService.getOrThrow<string>('OLLAMA_MODEL');
  const baseUrl = configService.getOrThrow<string>('OLLAMA_BASE_URL');
  const temperature = parseTemperature(
    configService.getOrThrow<string | number>('OLLAMA_TEMPERATURE'),
  );

  const llm = new ChatOllama({
    model,
    baseUrl,
    temperature,
  });

  return { llm, provider: 'ollama' };
}
