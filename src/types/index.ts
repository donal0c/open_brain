export type ThoughtContext = 'work' | 'personal' | 'unclassified';

export type ThoughtType =
  | 'decision'
  | 'insight'
  | 'meeting_note'
  | 'idea'
  | 'task'
  | 'observation'
  | 'reference'
  | 'personal_note';

export interface Thought {
  id: string;
  raw_text: string;
  context: ThoughtContext;
  people: string[];
  topics: string[];
  thought_type: ThoughtType | null;
  action_items: string[];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface ThoughtWithScore extends Thought {
  similarity: number;
}

export interface ExtractedMetadata {
  people: string[];
  topics: string[];
  thought_type: ThoughtType;
  action_items: string[];
  context: ThoughtContext;
}

export interface InsertThoughtParams {
  raw_text: string;
  embedding: number[];
  context: ThoughtContext;
  people: string[];
  topics: string[];
  thought_type: ThoughtType | null;
  action_items: string[];
  metadata: Record<string, unknown>;
}

export interface MetadataSearchParams {
  people?: string[];
  topics?: string[];
  thought_type?: ThoughtType;
  date_from?: string;
  date_to?: string;
  context?: ThoughtContext;
  limit?: number;
}

export interface ThoughtStats {
  total_thoughts: number;
  by_context: Record<ThoughtContext, number>;
  by_type: Record<string, number>;
  top_topics: Array<{ topic: string; count: number }>;
  top_people: Array<{ person: string; count: number }>;
  thoughts_last_7_days: number;
  thoughts_last_30_days: number;
}
