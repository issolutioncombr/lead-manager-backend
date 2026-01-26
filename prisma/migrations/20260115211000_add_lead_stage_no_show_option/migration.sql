-- Add "Não compareceu" value to LeadStage enum
DO $$
BEGIN
    ALTER TYPE "LeadStage" ADD VALUE 'Não compareceu';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
