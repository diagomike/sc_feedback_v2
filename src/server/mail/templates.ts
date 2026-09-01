/** Minimal inline HTML templates for the MVP, ported verbatim from v1. */

export function registrationEmail(params: { name: string; link: string; role: string }) {
  return {
    subject: `You're invited to join the Feedback System (${params.role})`,
    html: `
      <p>Hello ${params.name},</p>
      <p>You've been invited to join the university feedback system as a <b>${params.role}</b>.</p>
      <p><a href="${params.link}">Complete your registration</a></p>
      <p>This link expires in 14 days.</p>
    `,
  };
}

/** `courseLabel` is what keeps two invitations for the same teacher distinguishable — a
 *  student taking two of their courses gets two separate forms, and without the course in
 *  the subject line both mails read identically in an inbox. Null for peer and head
 *  invitations, which are about the person rather than a course. */
export function campaignInviteEmail(params: {
  name: string;
  teacherName: string;
  courseLabel?: string | null;
  link: string;
}) {
  const about = params.courseLabel ? `${params.teacherName} — ${params.courseLabel}` : params.teacherName;
  return {
    subject: `Feedback requested: ${about}`,
    html: `
      <p>Hello ${params.name},</p>
      <p>Please share your feedback on ${about}.</p>
      <p><a href="${params.link}">Give feedback</a></p>
    `,
  };
}
