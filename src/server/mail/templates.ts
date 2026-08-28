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

export function campaignInviteEmail(params: { name: string; teacherName: string; link: string }) {
  return {
    subject: `Feedback requested: ${params.teacherName}`,
    html: `
      <p>Hello ${params.name},</p>
      <p>Please share your feedback on ${params.teacherName}.</p>
      <p><a href="${params.link}">Give feedback</a></p>
    `,
  };
}
