import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/session
 * Ensures a global session ("My Notebook") exists.
 * Returns the session.
 */

export async function GET() {
  try {
    // check if notebook exists
    let session = await prisma.session.findFirst({
      where: { name: "My Notebook" },
    });

    // if not create a new notebook
    if (!session) {
      session = await prisma.session.create({
        data: {
          name: "My Notebook",
          description: "This is my notebook",
        },
      });
    }

    return NextResponse.json(session);
  } catch (error) {
    {
      error: "Failed to fetch session.";
    }
    {
      status: 500;
    }
  }
}
