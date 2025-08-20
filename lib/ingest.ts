import { parse } from "csv-parse/sync";
import { Document } from "langchain/document";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { embeddings } from "@/lib/embeddings";
import { Prisma, prisma } from "@/lib/db";
import { crawlSite, CrawlOptions } from "@/lib/crawler";
import { randomUUID } from "crypto";

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

const normalizeMetadata = (
  base: Record<string, any>,
  extra?: Record<string, any>
) => ({ ...base, ...(extra || {}) });

// Batch insert chunks for better performance
async function batchInsertChunks(
  chunks: Array<{
    sourceId: string;
    content: string;
    vector: number[];
    metadata: any;
  }>,
  tx: Prisma.TransactionClient
) {
  // Process in batches of 50 to avoid overwhelming the database
  const BATCH_SIZE = 50;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    // Build values for batch insert
    const values: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const chunk of batch) {
      const id = randomUUID();
      values.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${
          paramIndex + 3
        }::vector, $${paramIndex + 4}::jsonb, now(), now())`
      );
      params.push(
        id,
        chunk.sourceId,
        chunk.content,
        `[${chunk.vector.join(",")}]`,
        JSON.stringify(chunk.metadata)
      );
      paramIndex += 5;
    }

    const query = `
      INSERT INTO "SourceChunk" 
      ("id", "sourceId", "content", "embedding", "metadata", "createdAt", "updatedAt")
      VALUES ${values.join(", ")}
    `;

    await tx.$executeRawUnsafe(query, ...params);
  }
}

// Helper to extract clean name from URL
function extractNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    const segments = pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1];

    if (lastSegment && lastSegment !== "index.html") {
      return decodeURIComponent(lastSegment)
        .replace(/\.(html|htm|php)$/i, "")
        .replace(/[-_]/g, " ")
        .substring(0, 50);
    }

    return urlObj.hostname.replace("www.", "").substring(0, 30);
  } catch {
    return url.substring(0, 30);
  }
}

// Helper to extract name from filename
function extractNameFromFile(filename: string): string {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  return nameWithoutExt.length > 40
    ? nameWithoutExt.substring(0, 37) + "..."
    : nameWithoutExt;
}

export async function ingestWebsite(
  sessionId: string,
  url: string
): Promise<string> {
  if (!sessionId) throw new Error("Session ID is required");
  if (!url || typeof url !== "string") throw new Error("Valid URL is required");

  try {
    new URL(url);
  } catch {
    throw new Error("Invalid URL format");
  }

  try {
    // Step 1: Load and process documents (outside transaction)
    const crawledPages = await crawlSite(url, { maxDepth: 2, maxPages: 20 });

    if (!crawledPages.length) {
      throw new Error("No content found at the specified URL");
    }

    const docsWithMetadata = crawledPages.map(
      (page, i) =>
        new Document({
          pageContent: page.content,
          metadata: normalizeMetadata({ url: page.url }, { pageIndex: i }),
        })
    );

    const chunks = await splitter.splitDocuments(docsWithMetadata);
    if (!chunks.length) {
      throw new Error("No valid content chunks were generated");
    }

    // Step 2: Generate embeddings (outside transaction - this is the slow part)
    console.log(`Generating embeddings for ${chunks.length} chunks...`);
    const texts = chunks.map((c) => c.pageContent);
    const vectors = await embeddings.embedDocuments(texts);
    console.log(`Embeddings generated successfully`);

    // Step 3: Create source and insert chunks in transaction (fast operations only)
    const sourceId = await prisma.$transaction(
      async (tx) => {
        const source = await tx.source.create({
          data: {
            sessionId,
            name: extractNameFromUrl(url),
            type: "url",
          },
        });

        // Prepare chunk data
        const chunkData = chunks.map((chunk, i) => ({
          sourceId: source.id,
          content: chunk.pageContent,
          vector: vectors[i],
          metadata: normalizeMetadata({ url, source: url }, chunk.metadata),
        }));

        // Batch insert chunks
        await batchInsertChunks(chunkData, tx);

        return source.id;
      },
      {
        timeout: 15000,
      }
    );

    return sourceId;
  } catch (err: any) {
    console.error("[ingestWebsite] Error:", err);
    throw new Error(`Failed to ingest website: ${err.message}`);
  }
}

export const ingestPDF = async (
  sessionId: string,
  fileName: string,
  fileBuffer: Buffer
): Promise<string> => {
  if (!sessionId) throw new Error("Session ID is required");
  if (!fileName || !fileBuffer) {
    throw new Error("File name and buffer are required");
  }

  try {
    // Step 1: Load and process PDF (outside transaction)
    const loader = new PDFLoader(new Blob([new Uint8Array(fileBuffer)]), {
      parsedItemSeparator: "\n\n",
    });

    const docs = await loader.load();
    if (!docs?.length) {
      throw new Error("No content found in the PDF");
    }

    const docsWithMetadata = docs.map((doc, i) => {
      const page = doc.metadata?.loc?.pageNumber ?? i + 1;
      return new Document({
        pageContent: doc.pageContent,
        metadata: normalizeMetadata({ page, source: fileName }),
      });
    });

    const chunks = await splitter.splitDocuments(docsWithMetadata);
    if (!chunks.length) {
      throw new Error("No valid content chunks were generated from the PDF");
    }

    // Step 2: Generate embeddings (outside transaction)
    console.log(
      `Generating embeddings for ${chunks.length} chunks from PDF...`
    );
    const texts = chunks.map((c) => c.pageContent);
    const vectors = await embeddings.embedDocuments(texts);
    console.log(`PDF embeddings generated successfully`);

    // Step 3: Create source and insert chunks in transaction
    const sourceId = await prisma.$transaction(
      async (tx) => {
        const source = await tx.source.create({
          data: {
            sessionId,
            name: extractNameFromFile(fileName),
            type: "pdf",
          },
        });

        // Prepare chunk data
        const chunkData = chunks.map((chunk, i) => ({
          sourceId: source.id,
          content: chunk.pageContent,
          vector: vectors[i],
          metadata: normalizeMetadata({ source: fileName }, chunk.metadata),
        }));

        // Batch insert chunks
        await batchInsertChunks(chunkData, tx);

        return source.id;
      },
      {
        timeout: 15000,
      }
    );

    return sourceId;
  } catch (err: any) {
    console.error("[ingestPDF] Error:", err);
    throw new Error(`Failed to ingest PDF: ${err.message}`);
  }
};

export const ingestCSV = async (
  sessionId: string,
  fileName: string,
  buffer: Buffer
): Promise<string> => {
  if (!sessionId) throw new Error("Session ID is required");
  if (!fileName) throw new Error("File name is required");
  if (!buffer?.length) throw new Error("CSV buffer is required");

  try {
    // Step 1: Load and process CSV (outside transaction)
    const records = parse(buffer.toString("utf-8"), {
      columns: true,
      skip_empty_lines: true,
    });

    const docsWithMeta = records.map((row, idx) => {
      return new Document({
        pageContent: JSON.stringify(row),
        metadata: { row: idx + 1, source: fileName },
      });
    });

    const chunks = await splitter.splitDocuments(docsWithMeta);
    if (!chunks.length) {
      throw new Error("No valid content chunks were generated");
    }

    // Step 2: Generate embeddings (outside transaction)
    console.log(
      `Generating embeddings for ${chunks.length} chunks from CSV...`
    );
    const texts = chunks.map((c) => c.pageContent);
    const vectors = await embeddings.embedDocuments(texts);
    console.log(`CSV embeddings generated successfully`);

    // Step 3: Create source and insert chunks in transaction
    const sourceId = await prisma.$transaction(
      async (tx) => {
        const source = await tx.source.create({
          data: {
            sessionId,
            name: extractNameFromFile(fileName),
            type: "csv",
          },
        });

        // Prepare chunk data
        const chunkData = chunks.map((chunk, i) => ({
          sourceId: source.id,
          content: chunk.pageContent,
          vector: vectors[i],
          metadata: normalizeMetadata({ source: fileName }, chunk.metadata),
        }));

        // Batch insert chunks
        await batchInsertChunks(chunkData, tx);

        return source.id;
      },
      {
        timeout: 15000,
      }
    );

    return sourceId;
  } catch (err: any) {
    console.error("[ingestCSV] Error:", err);
    throw new Error(`Failed to ingest CSV: ${err.message}`);
  }
};

export async function ingestTXT(
  sessionId: string,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  if (!sessionId) throw new Error("Session ID is required");
  if (!fileName) throw new Error("File name is required");
  if (!buffer?.length) throw new Error("TXT buffer is required");

  try {
    // Step 1: Load and process TXT (outside transaction)
    const loader = new TextLoader(new Blob([new Uint8Array(buffer)]));
    const docs = await loader.load();

    if (!docs?.length) {
      throw new Error("No content in TXT");
    }

    const docsWithMeta = docs.map(
      (d) =>
        new Document({
          pageContent: d.pageContent,
          metadata: normalizeMetadata({ source: fileName }),
        })
    );

    const chunks = await splitter.splitDocuments(docsWithMeta);
    if (!chunks.length) {
      throw new Error("No valid content chunks were generated");
    }

    // Step 2: Generate embeddings (outside transaction)
    console.log(
      `Generating embeddings for ${chunks.length} chunks from TXT...`
    );
    const texts = chunks.map((c) => c.pageContent);
    const vectors = await embeddings.embedDocuments(texts);
    console.log(`TXT embeddings generated successfully`);

    // Step 3: Create source and insert chunks in transaction
    const sourceId = await prisma.$transaction(
      async (tx) => {
        const source = await tx.source.create({
          data: {
            sessionId,
            name: extractNameFromFile(fileName),
            type: "txt",
          },
        });

        // Prepare chunk data
        const chunkData = chunks.map((chunk, i) => ({
          sourceId: source.id,
          content: chunk.pageContent,
          vector: vectors[i],
          metadata: normalizeMetadata({ source: fileName }, chunk.metadata),
        }));

        // Batch insert chunks
        await batchInsertChunks(chunkData, tx);

        return source.id;
      },
      {
        timeout: 15000,
      }
    );

    return sourceId;
  } catch (err: any) {
    console.error("[ingestTXT] Error:", err);
    throw new Error(`Failed to ingest TXT: ${err.message}`);
  }
}
