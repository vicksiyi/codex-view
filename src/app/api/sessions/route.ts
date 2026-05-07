import { NextResponse } from "next/server";
import { listSessions } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toBool(value: string | null) {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true";
}

function toInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const start = searchParams.get("start") ?? undefined;
  const end = searchParams.get("end") ?? undefined;
  const withTools = toBool(searchParams.get("withTools"));
  const withErrors = toBool(searchParams.get("withErrors"));
  const limit = toInt(searchParams.get("limit"), 100);
  const offset = toInt(searchParams.get("offset"), 0);

  const sessions = await listSessions({ q, start, end, withTools, withErrors, limit, offset });
  return NextResponse.json(sessions);
}
