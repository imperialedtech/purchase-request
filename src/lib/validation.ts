import { z } from "zod";

// Shared input schemas. Every server action/service parses input with these;
// client-side use is only for early feedback.

const money = z
  .string()
  .trim()
  .regex(/^\d{1,15}(\.\d{1,2})?$/, "Enter a valid amount (max 2 decimal places)");

const qty = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,3})?$/, "Enter a valid quantity")
  .refine((v) => Number(v) > 0, "Quantity must be greater than zero");

export const lineItemSchema = z.object({
  description: z.string().trim().min(2, "Description is required").max(500),
  specifications: z.string().trim().max(2000).optional().default(""),
  quantity: qty,
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "Invalid currency"),
  unitPrice: money,
});

export const draftSchema = z.object({
  entityId: z.string().uuid(),
  title: z.string().trim().max(200).default(""),
  categoryId: z.string().uuid().nullable().optional(),
  comments: z.string().max(10000).default(""),
  paymentDetails: z.string().max(4000).optional().default(""),
  items: z.array(lineItemSchema).max(100, "A maximum of 100 line items is allowed"),
});
export type DraftInput = z.input<typeof draftSchema>;

/** Stricter rules applied when a PR is submitted. */
export const submitSchema = draftSchema.extend({
  title: z.string().trim().min(3, "Enter a short summary of the request").max(200),
  categoryId: z.string().uuid({ message: "Select a purchase category" }),
  comments: z.string().trim().min(10, "Provide the purpose / business justification (min. 10 characters)").max(10000),
  items: z.array(lineItemSchema).min(1, "Add at least one line item").max(100),
});

export const decisionSchema = z
  .object({
    requestId: z.string().uuid(),
    decision: z.enum(["APPROVED", "REJECTED", "CLARIFICATION_REQUESTED"]),
    comment: z.string().trim().max(4000).optional().default(""),
  })
  .superRefine((v, ctx) => {
    if (v.decision !== "APPROVED" && v.comment.length < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["comment"],
        message: v.decision === "REJECTED" ? "A rejection reason is required" : "Explain what clarification is needed",
      });
    }
  });

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200)
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
