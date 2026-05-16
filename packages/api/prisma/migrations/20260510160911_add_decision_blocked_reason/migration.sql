-- Add blockedReason column for live decisions rejected by risk/engine gates.
ALTER TABLE "LlmDecision" ADD COLUMN "blockedReason" TEXT;
