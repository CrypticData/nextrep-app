import { NextResponse } from "next/server";
import {
  bodyweightRecordSelect,
  toBodyweightRecordResponse,
} from "@/lib/bodyweight-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const record = await prisma.bodyweightRecord.findFirst({
    orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
    select: bodyweightRecordSelect,
  });

  return NextResponse.json(record ? toBodyweightRecordResponse(record) : null);
}
