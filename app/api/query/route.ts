// app/api/query/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { embeddings } from "@/lib/embeddings";
import { groq } from "@/lib/llm";
import { SYSTEM_RAG_QA, SYSTEM_GENERAL, userRagQA } from "@/lib/prompts";

function normalizeArray<T>(val: unknown): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val as T[];
  return [val as T];
}

function hashText(s: string): string {
  const t = s.replace(/\s+/g, " ").trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return `${h}`;
}

const SMALL_TALK =
  /^(hi|hello|hey|how are you|what's up|good (morning|evening|afternoon))/i;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sessionId = String(body?.sessionId || "");
    const query = String(body?.query || "");
    const selectedSources = normalizeArray<string>(
      body?.selectedSources ?? body?.sourceId
    );
    const topK = Number(body?.topK || 8);
    const topN = Number(body?.topN || 40);

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId required" },
        { status: 400 }
      );
    }
    if (!query) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }

    // 0) Persist the user message so ChatPanel shows it immediately
    const userMsg = await prisma.chat.create({
      data: { sessionId, role: "user", message: query },
    });

    // 1) Embed query (Gemini embeddings)
    const qVec = await embeddings.embedQuery(query);

    // 2) Retrieve wider pool with similarity and a score
    const retrieved = await (async () => {
      if (selectedSources.length > 0) {
        return prisma.$queryRawUnsafe<
          Array<{
            id: string;
            content: string;
            metadata: any;
            sourceId: string;
            score: number;
          }>
        >(
          `
          SELECT id, content, metadata, "sourceId",
                 (embedding <-> $2::vector) AS score
          FROM "SourceChunk"
          WHERE "sourceId" = ANY($1::text[])
          ORDER BY embedding <-> $2::vector
          LIMIT $3;
        `,
          selectedSources,
          `[${qVec.join(",")}]`,
          topN
        );
      }
      return prisma.$queryRawUnsafe<
        Array<{
          id: string;
          content: string;
          metadata: any;
          sourceId: string;
          score: number;
        }>
      >(
        `
        SELECT id, content, metadata, "sourceId",
               (embedding <-> $2::vector) AS score
        FROM "SourceChunk"
        WHERE "sourceId" IN (
          SELECT id FROM "Source" WHERE "sessionId" = $1
        )
        ORDER BY embedding <-> $2::vector
        LIMIT $3;
      `,
        sessionId,
        `[${qVec.join(",")}]`,
        topN
      );
    })();

    // 3) Diversity + dedup
    const deduped: typeof retrieved = [];
    const seen = new Set<string>();
    const perSourceCount = new Map<string, number>();
    const maxPerSourceFirstPass = 2;

    for (const r of retrieved) {
      const key = hashText(r.content);
      if (seen.has(key)) continue;
      const cnt = perSourceCount.get(r.sourceId) || 0;
      if (cnt < maxPerSourceFirstPass) {
        deduped.push(r);
        seen.add(key);
        perSourceCount.set(r.sourceId, cnt + 1);
      }
      if (deduped.length >= topK) break;
    }
    if (deduped.length < topK) {
      for (const r of retrieved) {
        if (deduped.length >= topK) break;
        const key = hashText(r.content);
        if (seen.has(key)) continue;
        deduped.push(r);
        seen.add(key);
      }
    }

    // Decide if we should fall back to general chat
    const noContext = deduped.length === 0;
    const isSmallTalk = SMALL_TALK.test(query);

    let answer = "";
    let followups: string[] = [];
    let citations: Array<{
      id: string;
      index: number;
      metadata: any;
      sourceId: string;
    }> = [];

    if (noContext || isSmallTalk) {
      // General chat (no citations)
      const resp = await groq.invoke([
        { role: "system", content: SYSTEM_GENERAL },
        { role: "user", content: query },
      ]);
      answer = resp.content.toString().trim();
      citations = [];
      followups = [];
    } else {
      // RAG flow
      const context = deduped
        .map((r, i) => `(${i + 1}) ${r.content}`)
        .join("\n\n");
      citations = deduped.map((r, i) => ({
        id: r.id,
        index: i + 1,
        metadata: r.metadata || {},
        sourceId: r.sourceId,
      }));

      const ragResp = await groq.invoke([
        { role: "system", content: SYSTEM_RAG_QA },
        { role: "user", content: userRagQA(context, query) },
      ]);

      try {
        const txt = ragResp.content.toString();
        const start = txt.indexOf("{");
        const end = txt.lastIndexOf("}");
        const json = JSON.parse(txt.slice(start, end + 1));
        answer = String(json?.answer || "");
        followups = Array.isArray(json?.followups) ? json.followups : [];
      } catch {
        answer =
          "I could not parse the model output. Please try rephrasing the question.";
        followups = [];
      }
      if (!answer) {
        answer = "I could not find relevant information in the sources.";
        followups = [];
      }
    }

    // 4) Store assistant message
    const assistant = await prisma.chat.create({
      data: { sessionId, role: "assistant", message: answer },
    });

    return NextResponse.json({
      userMessage: userMsg,
      answer,
      citations,
      retrievedChunks: deduped,
      chatMessage: assistant,
      followups,
    });
  } catch (err) {
    console.error("[POST /api/query] error:", err);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
