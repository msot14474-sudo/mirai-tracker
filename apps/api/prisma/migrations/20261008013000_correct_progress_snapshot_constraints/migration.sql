-- Pace is signed by definition: a negative value means the subject is behind.
ALTER TABLE "ProgressSnapshot"
  DROP CONSTRAINT "ProgressSnapshot_nonnegative_values_check";

ALTER TABLE "ProgressSnapshot"
  ADD CONSTRAINT "ProgressSnapshot_nonnegative_values_check" CHECK (
    "hoursInScopeMinutes" >= 0
    AND "coveredMinutes" >= 0
    AND "remainingMinutes" >= 0
    AND "availableMinutes" >= 0
    AND ("bufferRatio" IS NULL OR "bufferRatio" >= 0)
  );

ALTER TABLE "ProgressSnapshot"
  ADD CONSTRAINT "ProgressSnapshot_scope_consistency_check" CHECK (
    "coveredMinutes" <= "hoursInScopeMinutes"
    AND "remainingMinutes" = "hoursInScopeMinutes" - "coveredMinutes"
  );
