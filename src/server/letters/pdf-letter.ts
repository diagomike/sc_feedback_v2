import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { letterParagraphs, UNIVERSITY_NAME_AMHARIC, UNIVERSITY_NAME_ENGLISH, type LetterContent } from "./letter-content";

/** Ported from v1's letters/pdf-letter.ts. A PDF has to have its glyphs actually
 *  embedded at generation time; this looks for an Ethiopic font rather than bundling
 *  one (licensing) - if absent, the Amharic line is skipped and the letter stays valid.
 *
 *  v1's lookup only searched the Windows font directory, so it always returned null on a
 *  Linux deploy container (Vercel included) and silently dropped the Amharic university
 *  name from every production letter. ETHIOPIC_FONT_PATH is the deploy-time escape
 *  hatch: commit an OFL font (e.g. Noto Sans Ethiopic) and point this at it. */
function findEthiopicFont(): string | null {
  const configured = process.env.ETHIOPIC_FONT_PATH?.trim();
  if (configured) {
    const resolved = isAbsolute(configured) ? configured : join(process.cwd(), configured);
    if (existsSync(resolved)) return resolved;
    // Configured but missing is a deploy mistake, not a silent fallback.
    console.warn(`ETHIOPIC_FONT_PATH is set to "${configured}" but no file exists there; skipping the Amharic line.`);
  }

  const windowsDir = process.env.WINDIR ? join(process.env.WINDIR, "Fonts") : "C:\Windows\Fonts";
  const candidates = [
    join(windowsDir, "nyala.ttf"),
    join(windowsDir, "ebrima.ttf"),
    // Common Linux locations, for a self-hosted container with a font package installed.
    "/usr/share/fonts/truetype/abyssinica/AbyssinicaSIL-Regular.ttf",
    "/usr/share/fonts/truetype/noto/NotoSansEthiopic-Regular.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansEthiopic-Regular.ttf",
    "/usr/share/fonts/noto/NotoSansEthiopic-Regular.ttf",
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function drawLetter(doc: PDFKit.PDFDocument, c: LetterContent, ethiopicFont: string | null): void {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  if (ethiopicFont) {
    doc.font(ethiopicFont).fontSize(13).text(UNIVERSITY_NAME_AMHARIC, { align: "center" });
  }
  doc.font("Helvetica-Bold").fontSize(15).text(UNIVERSITY_NAME_ENGLISH, { align: "center" });
  doc.font("Helvetica").fontSize(9).text("Adama, Ethiopia", { align: "center" });
  doc.moveDown(1.5);

  doc.fontSize(10).text("\u1240\u1295 / Date: _______________", { align: "right" });
  doc.text("\u1241\u1325\u122D / Ref. No: _______________", { align: "right" });
  doc.font("Helvetica-Bold").text(`Head of ${c.departmentName} Department`, { align: "right" });
  doc.font("Helvetica").text(c.headName, { align: "right" });
  doc.moveDown(1);

  doc.text(`To: ${c.teacherName}`);
  doc.text("ASTU");
  doc.moveDown(1);

  doc.font("Helvetica-Bold").fontSize(11).text(`Subject: Evaluation Result of ${c.roundLabel}`, { underline: true });
  doc.moveDown(0.75);

  doc.font("Helvetica").fontSize(11);
  for (const text of letterParagraphs(c)) {
    doc.text(text, { align: "justify", width: pageWidth });
    doc.moveDown(0.75);
  }

  doc.text("Regards,");
  doc.moveDown(2.5);
  doc.text(c.headName);
  doc.text(`Head, ${c.departmentName} Department`);
  doc.moveDown(0.5);
  doc.text(`CC: ${c.departmentName} Department`);
}

/** One PDF with one letter per teacher, one page each. */
export function buildLettersPdf(letters: LetterContent[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 56 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ethiopicFont = findEthiopicFont();

    letters.forEach((c, i) => {
      if (i > 0) doc.addPage();
      drawLetter(doc, c, ethiopicFont);
    });

    if (letters.length === 0) doc.text("No letters to generate.");
    doc.end();
  });
}
