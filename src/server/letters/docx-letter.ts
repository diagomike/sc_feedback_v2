import { AlignmentType, Document, PageBreak, Packer, Paragraph, TextRun } from "docx";
import { letterParagraphs, UNIVERSITY_NAME_AMHARIC, UNIVERSITY_NAME_ENGLISH, type LetterContent } from "./letter-content";

/** Ported verbatim from v1's letters/docx-letter.ts. Word only ever references a font
 *  by NAME — rendering happens later in the reader's own Word install, which is what
 *  makes Amharic safe here with zero bundled assets. */
const AMHARIC_FONT = "Nyala";

function letterParagraphSet(c: LetterContent): Paragraph[] {
  const paras: Paragraph[] = [];

  paras.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: UNIVERSITY_NAME_AMHARIC, font: AMHARIC_FONT, size: 24 })] }));
  paras.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: UNIVERSITY_NAME_ENGLISH, bold: true, size: 28 })] }));
  paras.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Adama, Ethiopia", size: 18 })] }));
  paras.push(new Paragraph({ text: "", spacing: { after: 200 } }));

  paras.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun("ቀን / Date: _______________")] }));
  paras.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun("ቁጥር / Ref. No: _______________")] }));
  paras.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Head of ${c.departmentName} Department`, bold: true })] }));
  paras.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(c.headName)] }));
  paras.push(new Paragraph({ text: "", spacing: { after: 200 } }));

  paras.push(new Paragraph({ children: [new TextRun(`To: ${c.teacherName}`)] }));
  paras.push(new Paragraph({ children: [new TextRun("ASTU")] }));
  paras.push(new Paragraph({ text: "", spacing: { after: 200 } }));

  paras.push(new Paragraph({ children: [new TextRun({ text: `Subject: Evaluation Result of ${c.roundLabel}`, bold: true, underline: {} })], spacing: { after: 200 } }));

  for (const text of letterParagraphs(c)) {
    paras.push(new Paragraph({ children: [new TextRun(text)], spacing: { after: 200 } }));
  }

  paras.push(new Paragraph({ children: [new TextRun("Regards,")] }));
  paras.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  paras.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  paras.push(new Paragraph({ children: [new TextRun(c.headName)] }));
  paras.push(new Paragraph({ children: [new TextRun(`Head, ${c.departmentName} Department`)] }));
  paras.push(new Paragraph({ text: "", spacing: { after: 100 } }));
  paras.push(new Paragraph({ children: [new TextRun(`CC: ${c.departmentName} Department`)] }));

  return paras;
}

/** One .docx with one letter per teacher, page-break separated. */
export async function buildLettersDocx(letters: LetterContent[]): Promise<Buffer> {
  const children: Paragraph[] = [];
  letters.forEach((c, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(...letterParagraphSet(c));
  });

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
