export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface QdrantUpsertPayload {
  chunks: string[];
  subjectName: string;
  chapterIndex: number;
}
