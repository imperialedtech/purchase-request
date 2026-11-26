-- CreateEnum
CREATE TYPE "PRStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_LEVEL1', 'PENDING_FINANCE', 'PENDING_FINAL', 'PENDING_APPROVAL', 'RETURNED', 'REJECTED', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED', 'CLARIFICATION_REQUESTED');

-- CreateEnum
CREATE TYPE "StageApproverType" AS ENUM ('CATEGORY_APPROVER', 'ROLE', 'USER');

-- CreateEnum
CREATE TYPE "StageState" AS ENUM ('WAITING', 'ACTIVE', 'APPROVED', 'REJECTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "CurrencyMode" AS ENUM ('SINGLE', 'MULTI');

-- CreateEnum
CREATE TYPE "ResubmitRule" AS ENUM ('RETURNING_STAGE', 'FIRST_STAGE');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('INVITE', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "address" TEXT,
    "logoKey" TEXT,
    "prNumberFormat" TEXT NOT NULL DEFAULT '{CODE}-PR-{YEAR}-{SEQ}',
    "sequencePadding" INTEGER NOT NULL DEFAULT 4,
    "currencyMode" "CurrencyMode" NOT NULL DEFAULT 'SINGLE',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'NGN',
    "allowedCurrencies" TEXT[] DEFAULT ARRAY['NGN', 'USD', 'EUR', 'GBP']::TEXT[],
    "allowSelfApproval" BOOLEAN NOT NULL DEFAULT false,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "pdfFooterText" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isConfigured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level1ApproverId" UUID,
    "level1Label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT,
    "phone" TEXT,
    "departmentId" UUID,
    "passwordHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "canEditProfile" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_entities" (
    "userId" UUID NOT NULL,
    "entityId" UUID NOT NULL,

    CONSTRAINT "user_entities_pkey" PRIMARY KEY ("userId","entityId")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "entityId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tokens" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "resubmitRule" "ResubmitRule" NOT NULL DEFAULT 'RETURNING_STAGE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflow_stages" (
    "id" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "stageOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "statusKey" "PRStatus" NOT NULL,
    "approverType" "StageApproverType" NOT NULL,
    "roleId" UUID,
    "userId" UUID,
    "requireCommentOnApprove" BOOLEAN NOT NULL DEFAULT false,
    "escalationHours" INTEGER,

    CONSTRAINT "approval_workflow_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pr_number_sequences" (
    "entityId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pr_number_sequences_pkey" PRIMARY KEY ("entityId","year")
);

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "prNumber" TEXT,
    "title" TEXT NOT NULL,
    "requesterId" UUID NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterJobTitle" TEXT,
    "departmentId" UUID,
    "departmentName" TEXT,
    "categoryId" UUID,
    "workflowId" UUID,
    "resubmitRule" "ResubmitRule" NOT NULL DEFAULT 'RETURNING_STAGE',
    "comments" TEXT NOT NULL DEFAULT '',
    "paymentDetails" TEXT,
    "currency" TEXT,
    "totalAmount" DECIMAL(20,2),
    "status" "PRStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStageOrder" INTEGER,
    "returnedFromStage" INTEGER,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "requesterConfirmedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "lastSubmittedAt" TIMESTAMP(3),
    "finalApprovedAt" TIMESTAMP(3),
    "finalApproverId" UUID,
    "finalApproverName" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_items" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "specifications" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "currency" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "lineTotal" DECIMAL(20,2) NOT NULL,

    CONSTRAINT "purchase_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_assignments" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "stageOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "statusKey" "PRStatus" NOT NULL,
    "approverType" "StageApproverType" NOT NULL,
    "assignedUserId" UUID,
    "assignedRoleId" UUID,
    "state" "StageState" NOT NULL DEFAULT 'WAITING',
    "requireCommentOnApprove" BOOLEAN NOT NULL DEFAULT false,
    "escalationHours" INTEGER,
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "approval_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_approvals" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "stageOrder" INTEGER NOT NULL,
    "stageName" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "actorId" UUID NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorJobTitle" TEXT,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_request_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_comments" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "authorName" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COMMENT',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_request_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_revisions" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_request_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_attachments" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedById" UUID,

    CONSTRAINT "purchase_request_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "requestId" UUID,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "entityId" UUID,
    "requestId" UUID,
    "prNumber" TEXT,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "entities_code_key" ON "entities"("code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_entityId_name_key" ON "departments"("entityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_entityId_name_key" ON "categories"("entityId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "user_roles_userId_idx" ON "user_roles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_tokens_tokenHash_key" ON "user_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "approval_workflows_entityId_idx" ON "approval_workflows"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "approval_workflow_stages_workflowId_stageOrder_key" ON "approval_workflow_stages"("workflowId", "stageOrder");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_prNumber_key" ON "purchase_requests"("prNumber");

-- CreateIndex
CREATE INDEX "purchase_requests_entityId_status_idx" ON "purchase_requests"("entityId", "status");

-- CreateIndex
CREATE INDEX "purchase_requests_requesterId_idx" ON "purchase_requests"("requesterId");

-- CreateIndex
CREATE INDEX "purchase_requests_departmentId_idx" ON "purchase_requests"("departmentId");

-- CreateIndex
CREATE INDEX "purchase_requests_categoryId_idx" ON "purchase_requests"("categoryId");

-- CreateIndex
CREATE INDEX "purchase_requests_submittedAt_idx" ON "purchase_requests"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_request_items_requestId_lineNo_key" ON "purchase_request_items"("requestId", "lineNo");

-- CreateIndex
CREATE INDEX "approval_assignments_assignedUserId_idx" ON "approval_assignments"("assignedUserId");

-- CreateIndex
CREATE INDEX "approval_assignments_assignedRoleId_state_idx" ON "approval_assignments"("assignedRoleId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "approval_assignments_requestId_stageOrder_key" ON "approval_assignments"("requestId", "stageOrder");

-- CreateIndex
CREATE INDEX "purchase_request_approvals_requestId_idx" ON "purchase_request_approvals"("requestId");

-- CreateIndex
CREATE INDEX "purchase_request_approvals_actorId_idx" ON "purchase_request_approvals"("actorId");

-- CreateIndex
CREATE INDEX "purchase_request_comments_requestId_idx" ON "purchase_request_comments"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_request_revisions_requestId_revision_key" ON "purchase_request_revisions"("requestId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_request_attachments_storageKey_key" ON "purchase_request_attachments"("storageKey");

-- CreateIndex
CREATE INDEX "purchase_request_attachments_requestId_idx" ON "purchase_request_attachments"("requestId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "audit_logs_requestId_idx" ON "audit_logs"("requestId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_level1ApproverId_fkey" FOREIGN KEY ("level1ApproverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_entities" ADD CONSTRAINT "user_entities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_entities" ADD CONSTRAINT "user_entities_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflow_stages" ADD CONSTRAINT "approval_workflow_stages_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_workflow_stages" ADD CONSTRAINT "approval_workflow_stages_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pr_number_sequences" ADD CONSTRAINT "pr_number_sequences_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_assignments" ADD CONSTRAINT "approval_assignments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_assignments" ADD CONSTRAINT "approval_assignments_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_assignments" ADD CONSTRAINT "approval_assignments_assignedRoleId_fkey" FOREIGN KEY ("assignedRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_approvals" ADD CONSTRAINT "purchase_request_approvals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "purchase_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_approvals" ADD CONSTRAINT "purchase_request_approvals_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "approval_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_comments" ADD CONSTRAINT "purchase_request_comments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_revisions" ADD CONSTRAINT "purchase_request_revisions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_attachments" ADD CONSTRAINT "purchase_request_attachments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ───────────── Integrity constraints & protections (hand-written) ─────────────

-- Line item values must be valid
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "item_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "item_unit_price_non_negative" CHECK ("unitPrice" >= 0);
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "item_line_total_matches" CHECK ("lineTotal" = ROUND("quantity" * "unitPrice", 2));
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "item_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');

-- Submitted PRs must carry a PR number
ALTER TABLE "purchase_requests" ADD CONSTRAINT "pr_number_required_after_draft"
  CHECK ("status" = 'DRAFT' OR "prNumber" IS NOT NULL);

-- Audit log and approval records are append-only
CREATE OR REPLACE FUNCTION iprams_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION iprams_block_mutation();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION iprams_block_mutation();

CREATE TRIGGER approvals_append_only
  BEFORE UPDATE OR DELETE ON "purchase_request_approvals"
  FOR EACH ROW EXECUTE FUNCTION iprams_block_mutation();
