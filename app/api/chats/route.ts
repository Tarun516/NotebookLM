import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/chats?sessionId=...
 * Returns all chats for a session.
 */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  try {
    const chats = await prisma.chat.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(chats);
  } catch (err) {
    console.error("[GET /api/chats] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch chats" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chats?sessionId=...
 * Stores a new chat message for a session.
 * Expects JSON body with "message" field.
 *  Returns the created chat message.
 * @param req - The request object containing the sessionId and message.
 * @returns The created chat message or an error response.
 **/

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  try {
    const body = await req.json();
    const message = String(body?.message || "").trim();
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }
    const chat = await prisma.chat.create({
      data: { sessionId, role: "user", message },
    });
    return NextResponse.json(chat);
  } catch (err) {
    console.error("[POST /api/chats] error:", err);
    return NextResponse.json(
      { error: "Failed to store chat" },
      { status: 500 }
    );
  }
}
