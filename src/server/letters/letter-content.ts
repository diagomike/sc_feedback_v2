/**
 * The data shape and body text both renderers (docx and pdf) consume, so the Word and
 * PDF versions of the same letter can never say different things. Ported verbatim from
 * v1's letters/letter-content.ts.
 */

export interface LetterContent {
  teacherName: string;
  departmentName: string;
  headName: string;
  roundLabel: string;
  studentScore: number;
  peerScore: number;
  managerScore: number;
  overallScore: number;
}

export const UNIVERSITY_NAME_AMHARIC = "አዳማ ሳይንስና ቴክኖሎጂ የኒቨርሲቲ";
export const UNIVERSITY_NAME_ENGLISH = "ADAMA SCIENCE & TECHNOLOGY UNIVERSITY";

export function fmtScore5(n: number): string {
  return n.toFixed(2);
}

export function letterParagraphs(c: LetterContent): string[] {
  return [
    "As per the legislation, the performance evaluation of every staff member is conducted at the end of each semester. Staff are evaluated by students, colleagues, and the department head to measure their performance in teaching, research activities, participation in special interest groups, and discharging of extracurricular responsibilities.",
    `The evaluation done by students, colleagues, and the department head weigh 50%, 15%, and 35% respectively. Accordingly, you have been evaluated by the above three entities and the result shows ${fmtScore5(c.studentScore)}, ${fmtScore5(c.peerScore)}, and ${fmtScore5(c.managerScore)} respectively, which results in ${fmtScore5(c.overallScore)} overall performance out of 5 points.`,
    "Thank you for your continued contribution to the department. We encourage you to keep up the effort in teaching, research, and departmental engagement, and to work with the department on any areas identified for improvement, for the betterment of the department and ASTU as a whole.",
    "You are welcome to contact the department office to review your evaluation feedback in detail.",
  ];
}
