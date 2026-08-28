import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/server/auth/session";
import { generateLettersDocx, generateLettersPdf } from "@/server/letters/letters";
import { letterRequestSchema } from "@/lib/schemas/letters";

/** Binary letter downloads — a route handler rather than a server action, since a
 *  server action can't stream a non-JSON response. Recomputes rows itself rather than
 *  trusting a client-supplied preview, exactly like CSV commit re-validates. */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  const format = request.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "docx";

  const body = await request.json();
  const parsed = letterRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    if (format === "pdf") {
      const buffer = await generateLettersPdf(user.id, parsed.data);
      return new NextResponse(new Uint8Array(buffer), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="evaluation-letters.pdf"' },
      });
    }
    const buffer = await generateLettersDocx(user.id, parsed.data);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="evaluation-letters.docx"',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
