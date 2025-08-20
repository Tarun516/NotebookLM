import { Document } from "langchain/document";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { embeddings } from "./embeddings";
import { Prisma, prisma } from "./db";
import { crawlSite, CrawlOptions } from "@/lib/crawler";

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

async function insertChunkRowRaw(params: {
  sourceId: string;
  content: string;
  vector: number[];
  metadata: any;
}) {
  const { sourceId, content, vector, metadata } = params;
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "SourceChunk"
      ("sourceId","content","embedding","metadata","createdAt","updatedAt")
    VALUES
      ($1, $2, $3::vector, $4::jsonb, now(), now())
    `,
    sourceId,
    content,
    `[${vector.join(",")}]`,
    JSON.stringify(metadata)
  );
}

export type DeepIngestOptions = CrawlOptions & {
  maxChunksPerBatch?: number;
  selector?: string;
};

export const ingestWebsiteDeep = async (
  sessionId: string,
  baseUrl: string,
  options: DeepIngestOptions = {}
): Promise<{
  sourceId: string;
  pagesIndexed: number;
  chunksIndexed: number;
}> => {
  if (!sessionId) throw new Error("Session ID is required");
  if (!baseUrl) throw new Error("Base URL is required");
  new URL(baseUrl); // validate

  const {
    selector,
    maxDepth = 2,
    maxPages = 200,
    concurrency = 4,
    sameHostOnly = true,
    stripQuery = true,
    includePatterns,
    excludePatterns,
    userAgent,
    maxChunksPerBatch = 200,
  } = options;

  try {
    // Create Source (one per site)
    const source = await prisma.source.create({
      data: { sessionId, name: baseUrl, type: "url" },
    });

    // Crawl site for URLs
    const urls = await crawlSite(baseUrl, {
      maxDepth,
      maxPages,
      concurrency,
      sameHostOnly,
      stripQuery,
      includePatterns,
      excludePatterns,
      userAgent,
    });

    let totalChunks = 0;
    let currentBatchTexts: string[] = [];
    let currentBatchMeta: any[] = [];

    const flushBatch = async () => {
      if (currentBatchTexts.length === 0) return;
      const vectors = await embeddings.embedDocuments(currentBatchTexts);
      for (let i = 0; i < currentBatchTexts.length; i++) {
        await insertChunkRowRaw({
          sourceId: source.id,
          content: currentBatchTexts[i],
          vector: vectors[i],
          metadata: currentBatchMeta[i],
        });
      }
      totalChunks += currentBatchTexts.length;
      currentBatchTexts = [];
      currentBatchMeta = [];
    };

    for (const url of urls) {
      const loader = selector
        ? //@ts-ignore
          new CheerioWebBaseLoader(url, { selector })
        : new CheerioWebBaseLoader(url);
      const docs = await loader.load();
      if (!docs?.length) continue;

      // Normalize documents + split
      const docsWithMeta = docs.map(
        (d, i) =>
          new Document({
            pageContent: d.pageContent,
            metadata: normalizeMetadata(
              { url, source: d.metadata?.source ?? url },
              { paragraphIndex: i }
            ),
          })
      );

      const chunks = await splitter.splitDocuments(docsWithMeta);

      for (const c of chunks) {
        currentBatchTexts.push(c.pageContent);
        currentBatchMeta.push(normalizeMetadata({ url }, c.metadata));
        if (currentBatchTexts.length >= maxChunksPerBatch) {
          await flushBatch();
        }
      }
    }

    await flushBatch();

    return {
      sourceId: source.id,
      pagesIndexed: urls.length,
      chunksIndexed: totalChunks,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[ingestWebsiteDeep] Prisma error:", err.code, err.message);
      throw new Error(`Database operation failed (${err.code})`);
    }
    console.error("[ingestWebsiteDeep] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to deep-ingest website: ${msg}`);
  }
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
    for (let i = 0; i < vectors.length; i++) {
      const vec = vectors[i];
      const content = chunks[i].pageContent;
      const meta = normalizeMetadata({ url, source: url }, chunks[i].metadata);

      await prisma.$executeRawUnsafe(
        `
      INSERT INTO "SourceChunk"
        ("sourceId","content","embedding","metadata","createdAt","updatedAt")
      VALUES
        ($1, $2, $3::vector, $4::jsonb, now(), now())
      `,
        source.id,
        content,
        `[${vec.join(",")}]`,
        JSON.stringify(meta)
      );
    }
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
    for (let i = 0; i < vectors.length; i++) {
      const vec = vectors[i];
      const chunk = chunks[i];

      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "SourceChunk" ("id", "sourceId", "content", "embedding", "metadata", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), $1, $2, $3::vector, $4::jsonb, now(), now())
        `,
        source.id,
        chunk.pageContent,
        `[${vec.join(",")}]`, // vector literal
        JSON.stringify(normalizeMetadata({ source: fileName }, chunk.metadata)) // stringified JSON
      );
    }
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

    for (let i = 0; i < vectors.length; i++) {
      const vec = vectors[i];
      const chunk = chunks[i];

      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "SourceChunk" ("id", "sourceId", "content", "embedding", "metadata", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), $1, $2, $3::vector, $4::jsonb, now(), now())
        `,
        source.id,
        chunk.pageContent,
        `[${vec.join(",")}]`, // vector literal
        JSON.stringify(normalizeMetadata({ source: fileName }, chunk.metadata)) // stringified JSON
      );
    }

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

    for (let i = 0; i < vectors.length; i++) {
      const vec = vectors[i];
      const chunk = chunks[i];

      await prisma.$executeRawUnsafe(
        `
        INSERT INTO "SourceChunk" ("id", "sourceId", "content", "embedding", "metadata", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), $1, $2, $3::vector, $4::jsonb, now(), now())
        `,
        source.id,
        chunk.pageContent,
        `[${vec.join(",")}]`, // vector literal
        JSON.stringify(normalizeMetadata({ source: fileName }, chunk.metadata)) // stringified JSON
      );
    }

    return source.id;
  } catch (err) {
    console.error("[ingestTXT] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to ingest TXT: ${msg}`);
  }
}
