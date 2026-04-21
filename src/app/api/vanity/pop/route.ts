import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret");
  if (!process.env.VANITY_POP_SECRET || secret !== process.env.VANITY_POP_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ error: "Not implemented yet (PROMPT 2)" }, { status: 501 });
}
