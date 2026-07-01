export interface TaskFile {
  id: string;
  name: string;
  type: "document" | "image" | "audio" | "video" | "other";
  content?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  metadata?: Record<string, unknown>;
}
