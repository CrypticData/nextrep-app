import { NextResponse } from "next/server";
import { isKnownPrismaError } from "@/lib/exercise-api";
import {
  bodyweightRecordSelect,
  isBodyweightRecordId,
  parseBodyweightRecordMutationBody,
  toBodyweightRecordResponse,
} from "@/lib/bodyweight-api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type BodyweightRecordRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function notFound() {
  return NextResponse.json(
    { error: "Bodyweight record not found." },
    { status: 404 },
  );
}

async function getBodyweightRecordId(context: BodyweightRecordRouteContext) {
  const { id } = await context.params;
  return id;
}

export async function GET(
  _request: Request,
  context: BodyweightRecordRouteContext,
) {
  const id = await getBodyweightRecordId(context);

  if (!isBodyweightRecordId(id)) {
    return badRequest("Bodyweight record id must be a valid UUID.");
  }

  const record = await prisma.bodyweightRecord.findUnique({
    where: { id },
    select: bodyweightRecordSelect,
  });

  if (!record) {
    return notFound();
  }

  const settings = await prisma.appSettings.findUniqueOrThrow({
    where: { id: 1 },
    select: { defaultWeightUnit: true },
  });

  return NextResponse.json(
    toBodyweightRecordResponse(record, settings.defaultWeightUnit),
  );
}

export async function PATCH(
  request: Request,
  context: BodyweightRecordRouteContext,
) {
  const id = await getBodyweightRecordId(context);

  if (!isBodyweightRecordId(id)) {
    return badRequest("Bodyweight record id must be a valid UUID.");
  }

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

  try {
    const record = await prisma.bodyweightRecord.update({
      where: { id },
      data: {
        value: parsed.data.value,
        unit: parsed.data.unit,
        measuredAt: parsed.data.measuredAt,
      },
      select: bodyweightRecordSelect,
    });

    return NextResponse.json(
      toBodyweightRecordResponse(record, settings.defaultWeightUnit),
    );
  } catch (error) {
    if (isKnownPrismaError(error, "P2025")) {
      return notFound();
    }

    throw error;
  }
}

export async function DELETE(
  _request: Request,
  context: BodyweightRecordRouteContext,
) {
  const id = await getBodyweightRecordId(context);

  if (!isBodyweightRecordId(id)) {
    return badRequest("Bodyweight record id must be a valid UUID.");
  }

  try {
    await prisma.bodyweightRecord.delete({
      where: { id },
      select: { id: true },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isKnownPrismaError(error, "P2025")) {
      return notFound();
    }

    throw error;
  }
}
