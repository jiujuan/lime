export type MemoryCategory =
  | "identity"
  | "context"
  | "preference"
  | "experience"
  | "activity";

export type MemoryReferenceType = "conversation" | "project";

export type MemoryReferenceSource = "auto_extracted" | "manual" | "imported";

export interface MemoryReferenceMetadata {
  confidence: number;
  importance: number;
  access_count: number;
  last_accessed_at: number | null;
  source: MemoryReferenceSource;
  embedding: number[] | null;
}

export interface MemoryReferenceRecord {
  id: string;
  session_id: string;
  memory_type: MemoryReferenceType;
  category: MemoryCategory;
  title: string;
  content: string;
  summary: string;
  tags: string[];
  metadata: MemoryReferenceMetadata;
  created_at: number;
  updated_at: number;
  archived: boolean;
}
