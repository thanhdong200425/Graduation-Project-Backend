export interface MongoDBChunkPayload {
  chunks: string[];
  chapterId: string;
  pdfUploadId: string;
}

export interface MongoDBChunkResponse {
  success: boolean;
}
