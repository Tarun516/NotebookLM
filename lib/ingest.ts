// lib/ingest.ts
import { Document } from "langchain/document";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";
import { embeddings } from "@/lib/embeddings";
import { Prisma, prisma } from "@/lib/db";
import { crawlSite, CrawlOptions } from "@/lib/crawler";
import { randomUUID } from "crypto";

/* -------------------- shared utils -------------------- */

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

const normalizeMetadata = (
  base: Record<string, any>,
  extra?: Record<string, any>
) => ({ ...base, ...(extra || {}) });

// Single, safe insert for pgvector + jsonb
async function insertChunkRowRaw(params: {
  sourceId: string;
  content: string;
  vector: number[];
  metadata: any;
}) {
  const { sourceId, content, vector, metadata } = params;
  const id = randomUUID();

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO "SourceChunk"
      ("id","sourceId","content","embedding","metadata","createdAt","updatedAt")
    VALUES
      ($1,  $2,        $3,      $4::vector, $5::jsonb, now(), now())
    `,
    id, // $1 -> id
    sourceId, // $2 -> sourceId
    content, // $3 -> content
    `[${vector.join(",")}]`, // $4 -> embedding::vector
    JSON.stringify(metadata) // $5 -> metadata::jsonb
  );
}

// Optional: tiny yield to avoid long event-loop blocking in large loops
async function tick() {
  await new Promise((r) => setImmediate(r));
}

/* -------------------- deep website ingestion -------------------- */

export type DeepIngestOptions = CrawlOptions & {
  maxChunksPerBatch?: number; // default 200
  selector?: string; // e.g., "main,article,p,h1,h2,h3"
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
    const source = await prisma.source.create({
      data: { sessionId, name: baseUrl, type: "url" },
    });

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
    let texts: string[] = [];
    let metas: any[] = [];

    const flushBatch = async () => {
      if (!texts.length) return;
      const vectors = await embeddings.embedDocuments(texts);
      for (let i = 0; i < vectors.length; i++) {
        await insertChunkRowRaw({
          sourceId: source.id,
          content: texts[i],
          vector: vectors[i],
          metadata: metas[i],
        });
        if ((i + 1) % 200 === 0) await tick();
      }
      totalChunks += texts.length;
      texts = [];
      metas = [];
    };

    for (const url of urls) {
      const loader = selector
        ? // @ts-ignore - community loader accepts selector
          new CheerioWebBaseLoader(url, { selector })
        : new CheerioWebBaseLoader(url);

      const docs = await loader.load();
      if (!docs?.length) continue;

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
        texts.push(c.pageContent);
        metas.push(normalizeMetadata({ url }, c.metadata));
        if (texts.length >= maxChunksPerBatch) {
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

/* -------------------- single page website -------------------- */

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
    const loader = new CheerioWebBaseLoader(url);
    const docs = await loader.load();
    if (!docs?.length) throw new Error("No content found at the specified URL");

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

    const chunks = await splitter.splitDocuments(docsWithMetadata);
    if (!chunks.length)
      throw new Error("No valid content chunks were generated");

    const source = await prisma.source.create({
      data: { sessionId, name: url, type: "url" },
    });

    const texts = chunks.map((c) => c.pageContent);
    const vectors = await embeddings.embedDocuments(texts);

    for (let i = 0; i < vectors.length; i++) {
      await insertChunkRowRaw({
        sourceId: source.id,
        content: chunks[i].pageContent,
        vector: vectors[i],
        metadata: normalizeMetadata({ url, source: url }, chunks[i].metadata),
      });
      if ((i + 1) % 200 === 0) await tick();
    }

    return source.id;
  } catch (err: any) {
    console.error("[ingestWebsite] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to ingest website: ${msg}`);
  }
}

/* -------------------- PDF -------------------- */

export const ingestPDF = async (
  sessionId: string,
  fileName: string,
  fileBuffer: Buffer
): Promise<string> => {
  if (!sessionId) throw new Error("Session ID is required");
  if (!fileName || !fileBuffer)
    throw new Error("File name and buffer are required");

  try {
    const loader = new PDFLoader(new Blob([new Uint8Array(fileBuffer)]), {
      parsedItemSeparator: "\n\n",
    });
    const docs = await loader.load();
    if (!docs?.length) throw new Error("No content found in the PDF");

    const docsWithMetadata = docs.map((doc, i) => {
      const page =
        doc.metadata?.loc?.pageNumber ??
        // @ts-ignore optional in some loaders
        doc.metadata?.pdf?.pageNumber ??
        i + 1;

      return new Document({
        pageContent: doc.pageContent,
        metadata: normalizeMetadata({ page, source: fileName }),
      });
    });

    const chunks = await splitter.splitDocuments(docsWithMetadata);
    if (!chunks.length)
      throw new Error("No valid content chunks were generated from the PDF");

    const source = await prisma.source.create({
      data: { sessionId, name: fileName, type: "pdf" },
    });

    const texts = chunks.map((c) => c.pageContent);
    const vectors = await embeddings.embedDocuments(texts);

    for (let i = 0; i < vectors.length; i++) {
      await insertChunkRowRaw({
        sourceId: source.id,
        content: chunks[i].pageContent,
        vector: vectors[i],
        metadata: normalizeMetadata({ source: fileName }, chunks[i].metadata),
      });
      if ((i + 1) % 200 === 0) await tick();
    }

    return source.id;
  } catch (err: any) {
    console.error("[ingestPDF] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to ingest PDF: ${msg}`);
  }
};

/* -------------------- CSV -------------------- */

export const ingestCSV = async (
  sessionId: string,
  fileName: string,
  buffer: Buffer
): Promise<string> => {
  if (!sessionId) throw new Error("Session ID is required");
  if (!fileName) throw new Error("File name is required");
  if (!buffer?.length) throw new Error("CSV buffer is required");

  try {
    const loader = new CSVLoader(new Blob([new Uint8Array(buffer)]));
    const docs = await loader.load();
    if (!docs?.length) throw new Error("No rows parsed from CSV");

    const docsWithMeta = docs.map((d, idx) => {
      return new Document({
        pageContent: d.pageContent,
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
      await insertChunkRowRaw({
        sourceId: source.id,
        content: chunks[i].pageContent,
        vector: vectors[i],
        metadata: normalizeMetadata({ source: fileName }, chunks[i].metadata),
      });
      if ((i + 1) % 200 === 0) await tick();
    }

    return source.id;
  } catch (err) {
    console.error("[ingestCSV] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to ingest CSV: ${msg}`);
  }
};

/* -------------------- TXT -------------------- */

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
      await insertChunkRowRaw({
        sourceId: source.id,
        content: chunks[i].pageContent,
        vector: vectors[i],
        metadata: normalizeMetadata({ source: fileName }, chunks[i].metadata),
      });
      if ((i + 1) % 200 === 0) await tick();
    }

    return source.id;
  } catch (err) {
    console.error("[ingestTXT] Error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to ingest TXT: ${msg}`);
  }
}
