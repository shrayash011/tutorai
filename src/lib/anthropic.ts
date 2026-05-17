import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-sonnet-4-20250514';

export function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY');
  return new Anthropic({ apiKey });
}
