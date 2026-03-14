import OpenAI from 'openai';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float',
  });
  return response.data[0].embedding;
}

/**
 * Generate a contextual embedding by prepending metadata to the text.
 * This gives the embedding model richer context for better similarity matching.
 */
export async function generateContextualEmbedding(
  text: string,
  metadata: { context?: string; topics?: string[]; people?: string[] }
): Promise<number[]> {
  const parts: string[] = [];

  if (metadata.context) {
    parts.push(`[${metadata.context}]`);
  }
  if (metadata.topics && metadata.topics.length > 0) {
    parts.push(`[topics: ${metadata.topics.join(', ')}]`);
  }
  if (metadata.people && metadata.people.length > 0) {
    parts.push(`[people: ${metadata.people.join(', ')}]`);
  }

  const contextualText = parts.length > 0
    ? `${parts.join(' ')} ${text}`
    : text;

  return generateEmbedding(contextualText);
}
