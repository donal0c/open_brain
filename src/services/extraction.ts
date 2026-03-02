import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type { ExtractedMetadata, ThoughtContext, ThoughtType } from '../types/index.js';

const VALID_THOUGHT_TYPES: ThoughtType[] = [
  'decision', 'insight', 'meeting_note', 'idea',
  'task', 'observation', 'reference', 'personal_note',
];

const VALID_CONTEXTS: ThoughtContext[] = ['work', 'personal', 'unclassified'];

function isValidThoughtType(value: string): value is ThoughtType {
  return VALID_THOUGHT_TYPES.includes(value as ThoughtType);
}

function isValidContext(value: string): value is ThoughtContext {
  return VALID_CONTEXTS.includes(value as ThoughtContext);
}

let bedrockClient: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
  }
  return bedrockClient;
}

const EXTRACTION_PROMPT = `Analyze the following thought/note and extract structured metadata. Return ONLY valid JSON with no additional text.

{
  "people": ["list of people mentioned by name"],
  "topics": ["2-5 short topic phrases that categorize this thought"],
  "thought_type": "one of: decision, insight, meeting_note, idea, task, observation, reference, personal_note",
  "action_items": ["any follow-up actions or todos mentioned"],
  "context": "classify as 'work' or 'personal'. Default to 'work' if ambiguous."
}

Rules:
- people: Extract actual names of people mentioned. Empty array if none.
- topics: 2-5 short descriptive phrases. Always provide at least one.
- thought_type: Choose the single best fit from the allowed types.
- action_items: Extract explicit or implied todos/follow-ups. Empty array if none.
- context: 'work' for professional/business content, 'personal' for private life. Default 'work' if unclear. Anything involving technology, software, engineering, APIs, infrastructure, coding, architecture, startups, or product development is 'work' UNLESS the author explicitly says it's a personal project.

Thought to analyze:
`;

export async function extractMetadata(
  rawText: string,
  explicitContext?: ThoughtContext
): Promise<ExtractedMetadata> {
  const modelId = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-4-6';

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 1024,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: EXTRACTION_PROMPT + rawText,
        },
      ],
    }),
  });

  const response = await getClient().send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  let text: string = responseBody.content[0].text;

  // Strip accidental markdown fences
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('Failed to parse extraction response:', text);
    return {
      people: [],
      topics: [],
      thought_type: 'observation',
      action_items: [],
      context: explicitContext ?? 'unclassified',
    };
  }

  const people = Array.isArray(parsed.people)
    ? parsed.people.filter((p): p is string => typeof p === 'string')
    : [];

  const topics = Array.isArray(parsed.topics)
    ? parsed.topics.filter((t): t is string => typeof t === 'string')
    : [];

  const action_items = Array.isArray(parsed.action_items)
    ? parsed.action_items.filter((a): a is string => typeof a === 'string')
    : [];

  const thought_type =
    typeof parsed.thought_type === 'string' && isValidThoughtType(parsed.thought_type)
      ? parsed.thought_type
      : 'observation';

  const extractedContext =
    typeof parsed.context === 'string' && isValidContext(parsed.context)
      ? parsed.context
      : 'unclassified';

  return {
    people,
    topics,
    thought_type,
    action_items,
    context: explicitContext ?? extractedContext,
  };
}
