// gemini-2.0-flash pricing. Keep in sync with the frontend mock.ts constants.
export const IN_PRICE_PER_1M = 0.3; // $ per 1M input (prompt) tokens
export const OUT_PRICE_PER_1M = 2.5; // $ per 1M output (completion) tokens

// 1 credit = 1,000 tokens.
export const TOKENS_PER_CREDIT = 1000;

export function computeCostUsd(
  promptTokens: number,
  completionTokens: number,
): number {
  return (
    (promptTokens / 1_000_000) * IN_PRICE_PER_1M +
    (completionTokens / 1_000_000) * OUT_PRICE_PER_1M
  );
}
