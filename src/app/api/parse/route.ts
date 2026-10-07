import { NextResponse } from "next/server";
import { MAX_FILE_BYTES, parseFile } from "@/lib/parsers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No files received." }, { status: 400 });

  const results = await Promise.all(
    files.map(async (f) => {
      if (f.size > MAX_FILE_BYTES) {
        return { name: f.name, error: `File is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.` };
      }
      try {
        return await parseFile(f.name, Buffer.from(await f.arrayBuffer()));
      } catch (e) {
        return { name: f.name, error: e instanceof Error ? e.message : "Could not read file." };
      }
    }),
  );

  return NextResponse.json({ files: results });
}
