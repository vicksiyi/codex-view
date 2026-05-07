import { NextResponse } from "next/server";
import { getIndex } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start") ?? undefined;
  const end = searchParams.get("end") ?? undefined;
  const index = await getIndex({ start, end });
  return NextResponse.json(index);
}
