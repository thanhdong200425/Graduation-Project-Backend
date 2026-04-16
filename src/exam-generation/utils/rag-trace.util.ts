import * as fs from 'fs';
import * as path from 'path';

export interface RagTraceData {
  timestamp: string;
  params: {
    subjectCode: string;
    chapterNo: number;
    [key: string]: any;
  };
  searchQueries: string[];
  rawHits: {
    content: string;
    score: number;
    metadata: any;
  }[];
  finalChunks: any[];
  rawModelOutput?: string;
  error?: string;
}

/**
 * Saves RAG search and retrieval details to a local JSON file for debugging.
 * The file is created at the project root as 'rag-trace.json'.
 */
export async function saveRagTrace(data: Partial<RagTraceData>): Promise<void> {
  try {
    const tracePath = path.join(process.cwd(), 'rag-trace.json');
    
    let existingData: RagTraceData[] = [];
    if (fs.existsSync(tracePath)) {
      const fileContent = fs.readFileSync(tracePath, 'utf8');
      try {
        existingData = JSON.parse(fileContent);
        if (!Array.isArray(existingData)) existingData = [];
      } catch (e) {
        existingData = [];
      }
    }

    const newTrace: RagTraceData = {
      timestamp: new Date().toISOString(),
      params: data.params || { subjectCode: 'unknown', chapterNo: 0 },
      searchQueries: data.searchQueries || [],
      rawHits: data.rawHits || [],
      finalChunks: data.finalChunks || [],
      rawModelOutput: data.rawModelOutput,
      error: data.error,
    };

    // Keep only last 10 traces to prevent file from growing too large
    existingData.unshift(newTrace);
    const truncatedData = existingData.slice(0, 10);

    fs.writeFileSync(tracePath, JSON.stringify(truncatedData, null, 2), 'utf8');
    console.log(`[DEBUG] RAG Trace saved to ${tracePath}`);
  } catch (err) {
    console.error('[DEBUG] Failed to save RAG trace:', err);
  }
}
