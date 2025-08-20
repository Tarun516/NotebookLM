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

    // Persist the user message immediately
    const userMsg = await prisma.chat.create({
      data: { sessionId, role: "user", message: query },
    });

    // Determine search scope
    const searchMode = selectedSources.length === 0 ? "all" : "selected";

    let answer = "";
    let followups: string[] = [];
    let citations: Array<{
      id: string;
      index: number;
      metadata: any;
      sourceId: string;
    }> = [];

    // Check if we should use general chat (no sources selected + small talk)
    const useGeneralChat =
      selectedSources.length === 0 && SMALL_TALK.test(query);

    let deduped: Array<{
      id: string;
      content: string;
      metadata: any;
      sourceId: string;
      score: number;
    }> = [];

    if (useGeneralChat) {
      // General chat mode
      const resp = await groq.invoke([
        { role: "system", content: SYSTEM_GENERAL },
        { role: "user", content: query },
      ]);
      answer = resp.content.toString().trim();
    } else {
      // RAG mode - embed query
      const qVec = await embeddings.embedQuery(query);

      // Retrieve from selected sources or all sources
      const retrieved = await (async () => {
        if (selectedSources.length > 0) {
          // Search only in selected sources
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
        } else {
          // Search in all session sources
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
        }
      })();

      // Apply diversity filtering
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

      // Fill remaining slots if needed
      if (deduped.length < topK) {
        for (const r of retrieved) {
          if (deduped.length >= topK) break;
          const key = hashText(r.content);
          if (seen.has(key)) continue;
          deduped.push(r);
          seen.add(key);
        }
      }

      if (deduped.length === 0) {
        answer =
          selectedSources.length > 0
            ? "I couldn't find relevant information in the selected sources."
            : "I couldn't find relevant information in your sources.";
      } else {
        // Build context and get AI response
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
          answer = "I had trouble processing the response. Please try again.";
          followups = [];
        }
      }
    }

    // Store assistant response
    const assistant = await prisma.chat.create({
      data: { sessionId, role: "assistant", message: answer },
    });

    return NextResponse.json({
      userMessage: userMsg,
      answer,
      citations,
      retrievedChunks: useGeneralChat ? [] : deduped,
      chatMessage: assistant,
      followups,
      searchMode,
      sourcesUsed: selectedSources.length,
    });
  } catch (err) {
    console.error("[POST /api/query] error:", err);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}
