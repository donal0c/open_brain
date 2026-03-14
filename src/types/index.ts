export type LifeDomain =
  | 'personal'
  | 'family'
  | 'health'
  | 'finance'
  | 'social'
  | 'creative'
  | 'travel'
  | 'unclassified';

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
  context: LifeDomain;
  people: string[];
  topics: string[];
  thought_type: ThoughtType | null;
  action_items: string[];
  metadata: Record<string, unknown>;
  confidence: number;
  active: boolean;
  archived_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ThoughtWithScore extends Thought {
  similarity: number;
}

export interface DuplicateCandidate {
  id: string;
  raw_text: string;
  context: string;
  similarity: number;
}

export interface ExtractedMetadata {
  people: string[];
  topics: string[];
  thought_type: ThoughtType;
  action_items: string[];
  context: LifeDomain;
}

export interface InsertThoughtParams {
  raw_text: string;
  embedding: number[];
  context: LifeDomain;
  people: string[];
  topics: string[];
  thought_type: ThoughtType | null;
  action_items: string[];
  metadata: Record<string, unknown>;
  idempotency_key?: string;
}

export interface UpdateThoughtParams {
  id: string;
  raw_text?: string;
  embedding?: number[];
  context?: LifeDomain;
  people?: string[];
  topics?: string[];
  thought_type?: ThoughtType | null;
  action_items?: string[];
  confidence?: number;
  active?: boolean;
  archived_reason?: string | null;
}

export type LinkRelationship =
  | 'relates_to'
  | 'extends'
  | 'contradicts'
  | 'supports'
  | 'follows_up'
  | 'inspired_by'
  | 'blocks';

export interface ThoughtLink {
  id: string;
  source_id: string;
  target_id: string;
  relationship: LinkRelationship;
  note: string | null;
  created_at: Date;
}

export interface ThoughtLinkWithThought extends ThoughtLink {
  linked_thought: Thought;
}

export interface MetadataSearchParams {
  people?: string[];
  topics?: string[];
  thought_type?: ThoughtType;
  date_from?: string;
  date_to?: string;
  context?: LifeDomain;
  limit?: number;
}

export interface ThoughtStats {
  total_thoughts: number;
  active_thoughts: number;
  archived_thoughts: number;
  by_context: Record<string, number>;
  by_type: Record<string, number>;
  top_topics: Array<{ topic: string; count: number }>;
  top_people: Array<{ person: string; count: number }>;
  thoughts_last_7_days: number;
  thoughts_last_30_days: number;
  avg_confidence: number;
}
