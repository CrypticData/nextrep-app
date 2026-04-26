import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "reachable" });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        db: "unreachable",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }
}
