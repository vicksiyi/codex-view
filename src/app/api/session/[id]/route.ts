import { NextResponse } from "next/server";
import { getSessionTimeline } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const timeline = await getSessionTimeline(id);
  return NextResponse.json(timeline);
}
