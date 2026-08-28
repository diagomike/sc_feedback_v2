import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { letterParagraphs, UNIVERSITY_NAME_AMHARIC, UNIVERSITY_NAME_ENGLISH, type LetterContent } from "./letter-content";

/** Ported verbatim from v1's letters/pdf-letter.ts. A PDF has to have its glyphs
 *  actually embedded at generation time; this looks for a system Ethiopic font rather
 *  than bundling one (licensing) — if absent, the Amharic line is skipped. */
function findEthiopicFont(): string | null {
  const fontsDir = process.env.WINDIR ? join(process.env.WINDIR, "Fonts") : "C:\\Windows\\Fonts";
  for (const name of ["nyala.ttf", "ebrima.ttf"]) {
    const candidate = join(fontsDir, name);
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
