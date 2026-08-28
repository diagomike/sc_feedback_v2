/**
 * Plain string-literal mirrors of the Prisma enums (schema.prisma is the source of
 * truth). Kept here — rather than importing @prisma/client — so the web app never
 * depends on Prisma's generated client.
 */

export const ROLE_KINDS = ["ADMIN", "MANAGER", "TEACHER", "STUDENT"] as const;
export type RoleKind = (typeof ROLE_KINDS)[number];

export const USER_STATUSES = ["INVITED", "ACTIVE", "DISABLED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const TARGET_GROUPS = ["STUDENT", "PEER", "MANAGER"] as const;
export type TargetGroup = (typeof TARGET_GROUPS)[number];

export const TEMPLATE_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const SECTION_TYPES = ["LIKERT_GRID", "FREE_TEXT"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const CAMPAIGN_TYPES = ["EMAIL", "INSTANT"] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const CAMPAIGN_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const AUDIENCE_MODES = ["REGISTERED_ONLY", "GUEST_ALLOWED"] as const;
export type AudienceMode = (typeof AUDIENCE_MODES)[number];

export const RESPONDENT_KINDS = ["STUDENT", "PEER", "MANAGER", "GUEST"] as const;
export type RespondentKind = (typeof RESPONDENT_KINDS)[number];
