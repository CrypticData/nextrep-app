CREATE TABLE "bodyweight_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "value" DECIMAL(8, 2) NOT NULL,
    "unit" "WeightUnit" NOT NULL DEFAULT 'lbs',
    "measured_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bodyweight_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bodyweight_records_measured_at_idx" ON "bodyweight_records"("measured_at");

ALTER TABLE "bodyweight_records"
ADD CONSTRAINT "bodyweight_records_value_positive"
CHECK ("value" > 0);
