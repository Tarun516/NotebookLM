// app/api/sources/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ingestWebsite, ingestPDF, ingestCSV, ingestTXT } from "@/lib/ingest";

/**
 * GET /api/sources?sessionId=...
 * Returns all sources for a session.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  try {
    const sources = await prisma.source.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(sources);
  } catch (err) {
    console.error("[GET /api/sources] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch sources" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sources?sessionId=...
 * Accepts multipart/form-data with either:
 *  - url: string (ingest website)
 *  - file: File (pdf/csv/txt)
 * Ingests and returns updated source list.
 */
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const url = (formData.get("url") as string | null)?.trim() || null;
    const file = formData.get("file") as File | null;

    if (!url && !file) {
      return NextResponse.json(
        { error: "Provide either url or file" },
        { status: 400 }
      );
    }

    if (url) {
      await ingestWebsite(sessionId, url);
    } else if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const name = file.name;
      const lower = name.toLowerCase();
      const mime = (file.type || "").toLowerCase();

      if (mime === "application/pdf" || lower.endsWith(".pdf")) {
        await ingestPDF(sessionId, name, buffer);
      } else if (mime === "text/csv" || lower.endsWith(".csv")) {
        await ingestCSV(sessionId, name, buffer);
      } else if (mime === "text/plain" || lower.endsWith(".txt")) {
        await ingestTXT(sessionId, name, buffer);
      } else {
        return NextResponse.json(
          { error: `Unsupported file type: ${mime || name}` },
          { status: 400 }
        );
      }
    }

    // Return latest source list
    const sources = await prisma.source.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(sources);
  } catch (err) {
    console.error("[POST /api/sources] ingest error:", err);
    const msg = err instanceof Error ? err.message : "Ingest failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
