// Client-safe status metadata (labels and badge tones).

export const PR_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_LEVEL1",
  "PENDING_FINANCE",
  "PENDING_FINAL",
  "PENDING_APPROVAL",
  "RETURNED",
  "REJECTED",
  "APPROVED",
  "CANCELLED",
] as const;
export type PRStatusKey = (typeof PR_STATUSES)[number];

export const PENDING_STATUSES: PRStatusKey[] = ["SUBMITTED", "PENDING_LEVEL1", "PENDING_FINANCE", "PENDING_FINAL", "PENDING_APPROVAL"];

export const STATUS_LABEL: Record<PRStatusKey, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PENDING_LEVEL1: "Pending Level 1 Approval",
  PENDING_FINANCE: "Pending Finance Approval",
  PENDING_FINAL: "Pending Final Approval",
  PENDING_APPROVAL: "Pending Approval",
  RETURNED: "Returned for Clarification",
  REJECTED: "Rejected",
  APPROVED: "Approved",
  CANCELLED: "Cancelled",
};

export type Tone = "gray" | "blue" | "amber" | "violet" | "green" | "red" | "orange" | "slate";

export const STATUS_TONE: Record<PRStatusKey, Tone> = {
  DRAFT: "gray",
  SUBMITTED: "blue",
  PENDING_LEVEL1: "blue",
  PENDING_FINANCE: "violet",
  PENDING_FINAL: "amber",
  PENDING_APPROVAL: "blue",
  RETURNED: "orange",
  REJECTED: "red",
  APPROVED: "green",
  CANCELLED: "slate",
};

export const DECISION_LABEL: Record<string, string> = {
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CLARIFICATION_REQUESTED: "Clarification requested",
};
