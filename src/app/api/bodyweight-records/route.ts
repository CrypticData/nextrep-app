import { NextResponse } from "next/server";
import {
  bodyweightRecordSelect,
  parseBodyweightRecordMutationBody,
  toBodyweightRecordResponse,
} from "@/lib/bodyweight-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET() {
  const settings = await prisma.appSettings.findUniqueOrThrow({
    where: { id: 1 },
    select: { defaultWeightUnit: true },
  });
  const records = await prisma.bodyweightRecord.findMany({
    orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }],
    select: bodyweightRecordSelect,
  });

  return NextResponse.json(
    records.map((record) =>
      toBodyweightRecordResponse(record, settings.defaultWeightUnit),
    ),
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const settings = await prisma.appSettings.findUniqueOrThrow({
    where: { id: 1 },
    select: { defaultWeightUnit: true },
  });
  const parsed = parseBodyweightRecordMutationBody(
    body,
    settings.defaultWeightUnit,
  );

  if (!parsed.ok) {
    return badRequest(parsed.message);
  }

  const record = await prisma.bodyweightRecord.create({
    data: {
      value: parsed.data.value,
      unit: parsed.data.unit,
      measuredAt: parsed.data.measuredAt,
    },
    select: bodyweightRecordSelect,
  });

  return NextResponse.json(
    toBodyweightRecordResponse(record, settings.defaultWeightUnit),
    {
      status: 201,
    },
  );
}
