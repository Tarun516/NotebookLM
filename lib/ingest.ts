import { Document } from "langchain/document";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { embeddings } from "./embeddings";
import { Prisma, prisma } from "./db";

// Function to split doc into chunks
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

// Normalize metadata function
const normalizeMetadata = (
  base: Record<string, any>,
  extra?: Record<string, any>
) => {
  return { ...base, ...(extra || {}) };
};

/*----------- Website Loader -----------*/
export async function ingestWebsite(
  sessionId: string,
  url: string
): Promise<string> {
  // ------- validate inputs -------
  if (!sessionId) throw new Error("Session ID is required");
  if (!url || typeof url !== "string") throw new Error("Valid URL is required");
  try {
    new URL(url);
  } catch {
    throw new Error("Invalid URL format");
  }

  try {
    // Load HTML
    const loader = new CheerioWebBaseLoader(url);
    const docs = await loader.load();
    if (!docs?.length) throw new Error("No content found at the specified URL");

    // Normalize metadata and add source
    const docsWithMetadata = docs.map(
      (doc, i) =>
        new Document({
          pageContent: doc.pageContent,
          metadata: normalizeMetadata(
            { url, source: doc?.metadata?.source ?? url },
            { paragraphIndex: i }
          ),
        })
    );

    // Split documents into chunks
    const chunks = await splitter.splitDocuments(docsWithMetadata);
    if (!chunks.length)
      throw new Error("No valid content chunks were generated");

    // Upsert Source entry
    const source = await prisma.source.create({
      data: { sessionId, name: url, type: "url" },
    });

    // Embed chunks and create SourceChunk entries
    const texts = chunks.map((c) => c.pageContent);
    const vectors = await embeddings.embedDocuments(texts); // batch call

    // Use a transaction for bulk inserts
    await prisma.$transaction(
      vectors.map((vec, i) =>
        prisma.sourceChunk.create({
          data: {
            sourceId: source.id,
            content: chunks[i].pageContent,
            embedding: vec as any,
            metadata: normalizeMetadata(
              { url, source: url },
              chunks[i].metadata
            ),
          },
        })
      ),
      { timeout: 60_000 }
    );

    return source.id;
  } catch (err: any) {
    console.error("[ingestWebsite] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to ingest website: ${msg}`);
  }
}

/*----------- PDF Loader -----------*/
export const ingestPDF = async (
  sessionId: string,
  fileName: string,
  fileBuffer: Buffer
): Promise<string> => {
  if (!sessionId) throw new Error("Session ID is required");
  if (!fileName || !fileBuffer)
    throw new Error("File name and buffer are required");

  try {
    // Load PDF
    const loader = new PDFLoader(new Blob([new Uint8Array(fileBuffer)]), {
      parsedItemSeparator: "\n\n",
    });

    const docs = await loader.load();
    if (!docs?.length) throw new Error("No content found in the PDF");

    // Add metadata and normalize
    const docsWithMetadata = docs.map((doc, i) => {
      const page =
        doc.metadata?.loc?.pageNumber ?? doc.metadata?.pdf?.pageNumber ?? i + 1;

      return new Document({
        pageContent: doc.pageContent,
        metadata: normalizeMetadata({ page, source: fileName }),
      });
    });

    // Split documents into chunks
    const chunks = await splitter.splitDocuments(docsWithMetadata);
    if (!chunks.length)
      throw new Error("No valid content chunks were generated from the PDF");

    // Upsert Source entry
    const source = await prisma.source.create({
      data: { sessionId, name: fileName, type: "pdf" },
    });
    // Embed chunks and create SourceChunk entries

    const texts = chunks.map((c) => c.pageContent);
    const vectors = await embeddings.embedDocuments(texts);

    // Insert in a transaction (consider chunking for very large arrays)
    await prisma.$transaction(
      vectors.map((vec, i) =>
        prisma.sourceChunk.create({
          data: {
            sourceId: source.id,
            content: chunks[i].pageContent,
            embedding: vec as any,
            metadata: normalizeMetadata(
              { source: fileName },
              chunks[i].metadata
            ),
          },
        })
      ),
      { timeout: 60_000 }
    );

    return source.id;
  } catch (err: any) {
    console.error("[ingestPDF] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to ingest PDF: ${msg}`);
  }
};

/* ----------- CSV Loader ----------- */
export const ingestCSV = async (
  sessionId: string,
  fileName: string,
  buffer: Buffer
): Promise<string> => {
  if (!sessionId) throw new Error("Session ID is required");
  if (!fileName) throw new Error("File name is required");
  if (!buffer?.length) throw new Error("CSV buffer is required");

  try {
    const loader = new CSVLoader(new Blob([new Uint8Array(buffer)]), {
      // uses first row as header by default
    });
    const docs = await loader.load();
    if (!docs?.length) throw new Error("No rows parsed from CSV");

    // Each row becomes a small doc; keep row index for traceability
    const docsWithMeta = docs.map((d, idx) => {
      return new Document({
        pageContent: d.pageContent, // row as text
        metadata: normalizeMetadata({ row: idx + 1, source: fileName }),
      });
    });

    const chunks = await splitter.splitDocuments(docsWithMeta);
    if (!chunks.length)
      throw new Error("No valid content chunks were generated");

    const source = await prisma.source.create({
      data: { sessionId, name: fileName, type: "csv" },
    });

    const texts = chunks.map((c) => c.pageContent);
    const vectors = await embeddings.embedDocuments(texts);

    await prisma.$transaction(
      vectors.map((vec, i) =>
        prisma.sourceChunk.create({
          data: {
            sourceId: source.id,
            content: chunks[i].pageContent,
            embedding: vec as any,
            metadata: normalizeMetadata(
              { source: fileName },
              chunks[i].metadata
            ),
          },
        })
      ),
      { timeout: 60_000 }
    );

    return source.id;
  } catch (err) {
    console.error("[ingestCSV] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to ingest CSV: ${msg}`);
  }
};

/* -------------------- TXT Loader -------------------- */
export async function ingestTXT(
  sessionId: string,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  if (!sessionId) throw new Error("Session ID is required");
  if (!fileName) throw new Error("File name is required");
  if (!buffer?.length) throw new Error("TXT buffer is required");

  try {
    const loader = new TextLoader(new Blob([new Uint8Array(buffer)]));
    const docs = await loader.load();
    if (!docs?.length) throw new Error("No content in TXT");

    const docsWithMeta = docs.map(
      (d) =>
        new Document({
          pageContent: d.pageContent,
          metadata: normalizeMetadata({ source: fileName }),
        })
    );

    const chunks = await splitter.splitDocuments(docsWithMeta);
    if (!chunks.length)
      throw new Error("No valid content chunks were generated");

    const source = await prisma.source.create({
      data: { sessionId, name: fileName, type: "txt" },
    });

    const texts = chunks.map((c) => c.pageContent);
    const vectors = await embeddings.embedDocuments(texts);

    await prisma.$transaction(
      vectors.map((vec, i) =>
        prisma.sourceChunk.create({
          data: {
            sourceId: source.id,
            content: chunks[i].pageContent,
            embedding: vec as any,
            metadata: normalizeMetadata(
              { source: fileName },
              chunks[i].metadata
            ),
          },
        })
      ),
      { timeout: 60_000 }
    );

    return source.id;
  } catch (err) {
    console.error("[ingestTXT] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to ingest TXT: ${msg}`);
  }
}
