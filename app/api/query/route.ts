import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { embeddings } from "@/lib/embeddings";
import { groq } from "@/lib/llm";
import {
  SYSTEM_RAG_QA,
  userRagQA,
  generateStrategicFollowups,
  enhanceResponse,
  NO_RESULTS_COT_PROMPT,
  SYSTEM_GENERAL,
} from "@/lib/prompts";
import {
  formatResponse,
  generateContextualFollowups,
} from "@/lib/responseProcessor";

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
  const body = await req.json();
  const sessionId = String(body?.sessionId || "");
  const query = String(body?.query || "");
  const selectedSources = normalizeArray<string>(
    body?.selectedSources ?? body?.sourceId
  );
  const streaming = body?.streaming === true;
  const topK = Number(body?.topK || 8);
  const topN = Number(body?.topN || 40);

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  if (!query) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  try {
    // Store user message immediately
    const userMsg = await prisma.chat.create({
      data: { sessionId, role: "user", message: query },
    });

    if (streaming) {
      const encoder = new TextEncoder();
      const stream = new TransformStream();
      const writer = stream.writable.getWriter();

      // Process in background
      processStreamingQuery({
        sessionId,
        query,
        selectedSources,
        topK,
        topN,
        userMsg,
        writer,
        encoder,
      });

      return new Response(stream.readable, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
        },
      });
    } else {
      // Non-streaming response
      return await processNonStreamingQuery({
        sessionId,
        query,
        selectedSources,
        topK,
        topN,
        userMsg,
      });
    }
  } catch (err) {
    console.error("[POST /api/query] error:", err);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}

// Enhanced function to generate contextual no-results responses
async function generateNoResultsResponse(
  query: string,
  selectedSources: string[],
  sessionId: string,
  sources: any[]
): Promise<{ answer: string; followups: string[] }> {
  try {
    // Get source names for context
    const sourceNames =
      selectedSources.length > 0
        ? selectedSources
            .map((id) => {
              const source = sources.find((s) => s.id === id);
              return source?.name || "Unknown source";
            })
            .join(", ")
        : "your sources";

    const contextPrompt =
      selectedSources.length > 0
        ? `I searched through the selected sources (${sourceNames}) but couldn't find specific information about "${query}".`
        : `I searched through all your sources but couldn't find specific information about "${query}".`;

    const noResultsPrompt = `
The user asked: "${query}"
${contextPrompt}

Please provide a helpful, empathetic response that:
1. Acknowledges their question naturally
2. Explains what you searched through
3. Suggests alternative questions they might ask
4. Offers to help in other ways

Respond in JSON format:
{
  "answer": "Natural, helpful response",
  "followups": ["Alternative questions they could ask"]
}
    `;

    const response = await groq.invoke([
      { role: "system", content: SYSTEM_RAG_QA },
      { role: "user", content: noResultsPrompt },
    ]);

    try {
      const responseText = response.content.toString();
      const start = responseText.indexOf("{");
      const end = responseText.lastIndexOf("}");

      if (start !== -1 && end !== -1) {
        const json = JSON.parse(responseText.slice(start, end + 1));
        return {
          answer:
            json.answer ||
            "I couldn't find that information in your sources, but I'm here to help in other ways!",
          followups: Array.isArray(json.followups) ? json.followups : [],
        };
      }
    } catch (parseError) {
      console.error("Failed to parse no-results response:", parseError);
    }

    // Fallback response
    const fallbackAnswers = [
      `I looked through ${
        sourceNames === "your sources" ? "your sources" : sourceNames
      } but didn't find specific information about "${query}". Could you try rephrasing your question or asking about a related topic?`,
      `Hmm, I searched your sources but couldn't find details on "${query}". Would you like to ask about something else, or perhaps add more sources that might contain this information?`,
      `I went through your sources but didn't come across information about "${query}". Sometimes the information might be phrased differently - could you try asking in another way?`,
    ];

    const randomAnswer =
      fallbackAnswers[Math.floor(Math.random() * fallbackAnswers.length)];

    return {
      answer: randomAnswer,
      followups: [
        "What topics are covered in my sources?",
        "Can you summarize what you found instead?",
        "What related information is available?",
      ],
    };
  } catch (error) {
    console.error("Error generating no-results response:", error);
    return {
      answer:
        "I had trouble searching through your sources just now. Could you try asking again?",
      followups: [
        "Try rephrasing your question",
        "What can you tell me about my sources?",
      ],
    };
  }
}

async function processStreamingQuery({
  sessionId,
  query,
  selectedSources,
  topK,
  topN,
  userMsg,
  writer,
  encoder,
}: {
  sessionId: string;
  query: string;
  selectedSources: string[];
  topK: number;
  topN: number;
  userMsg: any;
  writer: WritableStreamDefaultWriter;
  encoder: TextEncoder;
}) {
  try {
    // Determine if we should use general chat mode
    const useGeneralChat =
      selectedSources.length === 0 && SMALL_TALK.test(query);

    let citations: Array<{
      id: string;
      index: number;
      metadata: any;
      sourceId: string;
    }> = [];

    if (useGeneralChat) {
      // ============ GENERAL CHAT MODE ============
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: "thinking" })}\n\n`)
      );

      const stream = await groq.stream([
        { role: "system", content: SYSTEM_GENERAL },
        { role: "user", content: query },
      ]);

      let fullResponse = "";
      for await (const chunk of stream) {
        const content = chunk.content;
        if (content) {
          fullResponse += content;
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "token",
                content,
                userMessageId: userMsg.id,
              })}\n\n`
            )
          );
        }
      }

      // Enhance the general response
      const enhancedResponse = enhanceResponse(fullResponse.trim());

      const assistantMsg = await prisma.chat.create({
        data: {
          sessionId,
          role: "assistant",
          message: enhancedResponse,
          citations: [],
        },
      });

      // Generate contextual follow-ups for general chat
      const generalFollowups = [
        "What would you like to know more about?",
        "How can I help you with your documents?",
        "Do you have any specific questions about your sources?",
      ];

      await writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "complete",
            chatMessage: assistantMsg,
            citations: [],
            followups: generalFollowups,
          })}\n\n`
        )
      );
    } else {
      // ============ RAG MODE ============

      // Step 1: Indicate we're searching
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: "searching" })}\n\n`)
      );

      // Step 2: Generate embeddings and search
      const qVec = await embeddings.embedQuery(query);

      // Get all sources for context and naming
      const allSources = await prisma.source.findMany({
        where: { sessionId },
        select: { id: true, name: true, type: true },
      });

      // Retrieve relevant chunks
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
            `SELECT id, content, metadata, "sourceId",
                    (embedding <-> $2::vector) AS score
             FROM "SourceChunk"
             WHERE "sourceId" = ANY($1::text[])
             ORDER BY embedding <-> $2::vector
             LIMIT $3;`,
            selectedSources,
            `[${qVec.join(",")}]`,
            topN
          );
        } else {
          return prisma.$queryRawUnsafe<
            Array<{
              id: string;
              content: string;
              metadata: any;
              sourceId: string;
              score: number;
            }>
          >(
            `SELECT id, content, metadata, "sourceId",
                    (embedding <-> $2::vector) AS score
             FROM "SourceChunk"
             WHERE "sourceId" IN (
               SELECT id FROM "Source" WHERE "sessionId" = $1
             )
             ORDER BY embedding <-> $2::vector
             LIMIT $3;`,
            sessionId,
            `[${qVec.join(",")}]`,
            topN
          );
        }
      })();

      // Step 3: Apply diversity filtering
      const deduped: typeof retrieved = [];
      const seen = new Set<string>();
      const perSourceCount = new Map<string, number>();
      const maxPerSourceFirstPass = 2;

      // First pass: limit per source
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

      // Second pass: fill remaining slots if needed
      if (deduped.length < topK) {
        for (const r of retrieved) {
          if (deduped.length >= topK) break;
          const key = hashText(r.content);
          if (seen.has(key)) continue;
          deduped.push(r);
          seen.add(key);
        }
      }

      // Step 4: Handle no results case
      if (deduped.length === 0) {
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: "thinking" })}\n\n`)
        );

        const sourceContext =
          selectedSources.length > 0
            ? `selected sources (${selectedSources
                .map(
                  (id) => allSources.find((s) => s.id === id)?.name || "Unknown"
                )
                .join(", ")})`
            : `all ${allSources.length} sources`;

        const noResultsPrompt = NO_RESULTS_COT_PROMPT.replace(
          "{QUERY}",
          query
        ).replace("{SOURCE_CONTEXT}", sourceContext);

        try {
          const noResultsResponse = await groq.invoke([
            { role: "system", content: SYSTEM_RAG_QA },
            { role: "user", content: noResultsPrompt },
          ]);

          const responseText = noResultsResponse.content.toString();
          let parsedResponse: { answer: string; followups: string[] };

          try {
            const start = responseText.indexOf("{");
            const end = responseText.lastIndexOf("}");
            if (start !== -1 && end !== -1) {
              const json = JSON.parse(responseText.slice(start, end + 1));
              parsedResponse = {
                answer: enhanceResponse(
                  json.answer ||
                    "I couldn't find that information in your sources."
                ),
                followups: Array.isArray(json.followups) ? json.followups : [],
              };
            } else {
              throw new Error("No JSON found");
            }
          } catch (parseError) {
            console.error("Failed to parse no-results response:", parseError);
            parsedResponse = {
              answer: `I searched through ${sourceContext} but couldn't find specific information about "${query}". What else would you like to explore?`,
              followups: [
                "What topics are covered in my sources?",
                "Can you summarize what information is available?",
                "How can I add more relevant sources?",
              ],
            };
          }

          // Stream the no-results response naturally
          const answerWords = parsedResponse.answer.split(" ");
          let streamedAnswer = "";

          for (const word of answerWords) {
            streamedAnswer += word + " ";
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "token",
                  content: word + " ",
                  userMessageId: userMsg.id,
                })}\n\n`
              )
            );
            // Small delay for natural streaming effect
            await new Promise((resolve) => setTimeout(resolve, 30));
          }

          const assistantMsg = await prisma.chat.create({
            data: {
              sessionId,
              role: "assistant",
              message: parsedResponse.answer,
              citations: [],
            },
          });

          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "complete",
                chatMessage: assistantMsg,
                citations: [],
                followups: parsedResponse.followups.slice(0, 3),
              })}\n\n`
            )
          );
        } catch (error) {
          console.error("Error generating no-results response:", error);

          const fallbackAnswer = `I searched through your sources but didn't find specific information about "${query}". Let me know what else I can help you explore!`;

          const assistantMsg = await prisma.chat.create({
            data: {
              sessionId,
              role: "assistant",
              message: fallbackAnswer,
              citations: [],
            },
          });

          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "complete",
                chatMessage: assistantMsg,
                citations: [],
                followups: [
                  "What information is available in my sources?",
                  "Can you help me with a different question?",
                  "How do I add more relevant sources?",
                ],
              })}\n\n`
            )
          );
        }
      } else {
        // Step 5: Build context and generate citations
        const context = deduped
          .map((r, i) => `(${i + 1}) ${r.content}`)
          .join("\n\n");

        citations = deduped.map((r, i) => ({
          id: r.id,
          index: i + 1,
          metadata: r.metadata || {},
          sourceId: r.sourceId,
        }));

        // Indicate we're generating the response
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "generating",
              citations,
            })}\n\n`
          )
        );

        // Step 6: Stream RAG response
        const stream = await groq.stream([
          { role: "system", content: SYSTEM_RAG_QA },
          { role: "user", content: userRagQA(context, query) },
        ]);

        let fullResponse = "";
        for await (const chunk of stream) {
          const content = chunk.content;
          if (content) {
            fullResponse += content;
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "token",
                  content,
                  userMessageId: userMsg.id,
                })}\n\n`
              )
            );
          }
        }

        // Step 7: Parse and enhance the final response
        try {
          const start = fullResponse.indexOf("{");
          const end = fullResponse.lastIndexOf("}");

          if (start !== -1 && end !== -1) {
            const jsonStr = fullResponse.slice(start, end + 1);
            const json = JSON.parse(jsonStr);

            // Enhance the answer
            const rawAnswer = String(json?.answer || "");
            const enhancedAnswer = enhanceResponse(rawAnswer);

            // Generate strategic follow-ups
            let finalFollowups: string[] = [];

            if (Array.isArray(json?.followups) && json.followups.length > 0) {
              finalFollowups = json.followups.slice(0, 3);
            } else {
              // Generate strategic follow-ups based on query and context
              finalFollowups = generateStrategicFollowups(query, context).slice(
                0,
                3
              );
            }

            const assistantMsg = await prisma.chat.create({
              data: {
                sessionId,
                role: "assistant",
                message: enhancedAnswer,
                citations: citations,
              },
            });

            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "complete",
                  chatMessage: assistantMsg,
                  citations,
                  followups: finalFollowups,
                })}\n\n`
              )
            );
          } else {
            throw new Error("No valid JSON found in response");
          }
        } catch (parseError) {
          console.error("JSON parsing failed:", parseError);

          // Fallback: use raw response enhanced
          const enhancedFallback = enhanceResponse(
            fullResponse.trim() ||
              "I had trouble processing the response. Please try rephrasing your question."
          );

          const assistantMsg = await prisma.chat.create({
            data: {
              sessionId,
              role: "assistant",
              message: enhancedFallback,
              citations: citations,
            },
          });

          const strategicFollowups = generateStrategicFollowups(
            query,
            context
          ).slice(0, 3);

          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "complete",
                chatMessage: assistantMsg,
                citations: citations,
                followups: strategicFollowups,
              })}\n\n`
            )
          );
        }
      }
    }
  } catch (error) {
    console.error("[processStreamingQuery] error:", error);

    // Send error response
    await writer.write(
      encoder.encode(
        `data: ${JSON.stringify({
          type: "error",
          error:
            "I encountered an issue while searching. Please try asking your question again.",
        })}\n\n`
      )
    );
  } finally {
    await writer.close();
  }
}

async function processNonStreamingQuery({
  sessionId,
  query,
  selectedSources,
  topK,
  topN,
  userMsg,
}: {
  sessionId: string;
  query: string;
  selectedSources: string[];
  topK: number;
  topN: number;
  userMsg: any;
}) {
  try {
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
            `SELECT id, content, metadata, "sourceId",
                    (embedding <-> $2::vector) AS score
             FROM "SourceChunk"
             WHERE "sourceId" = ANY($1::text[])
             ORDER BY embedding <-> $2::vector
             LIMIT $3;`,
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
            `SELECT id, content, metadata, "sourceId",
                    (embedding <-> $2::vector) AS score
             FROM "SourceChunk"
             WHERE "sourceId" IN (
               SELECT id FROM "Source" WHERE "sessionId" = $1
             )
             ORDER BY embedding <-> $2::vector
             LIMIT $3;`,
            sessionId,
            `[${qVec.join(",")}]`,
            topN
          );
        }
      })();

      // Apply diversity filtering
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
      data: {
        sessionId,
        role: "assistant",
        message: answer,
        citations: citations,
      },
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
    console.error("[processNonStreamingQuery] error:", err);
    throw err; // Re-throw to be handled by the main function
  }
}
