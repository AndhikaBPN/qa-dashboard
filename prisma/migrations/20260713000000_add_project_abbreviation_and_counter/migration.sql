-- AlterTable: add abbreviation to Project
ALTER TABLE "Project" ADD COLUMN "abbreviation" TEXT;

-- CreateTable: ProjectCounter for atomic tcId generation
CREATE TABLE "ProjectCounter" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProjectCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique abbreviation
CREATE UNIQUE INDEX "Project_abbreviation_key" ON "Project"("abbreviation");

-- DataMigration: auto-populate abbreviation for existing projects
DO $$
DECLARE
  r RECORD;
  base_abbr TEXT;
  final_abbr TEXT;
  cnt INT;
BEGIN
  FOR r IN SELECT id, name FROM "Project" WHERE abbreviation IS NULL ORDER BY "createdAt" LOOP
    -- First letter of each word, uppercased
    SELECT upper(string_agg(left(word, 1), ''))
    INTO base_abbr
    FROM unnest(string_to_array(trim(r.name), ' ')) AS word
    WHERE word <> '';

    -- Fallback: first 2 chars of name if single word or empty result
    IF base_abbr IS NULL OR length(base_abbr) < 2 THEN
      base_abbr := upper(left(trim(r.name), 2));
    END IF;

    -- Ensure uniqueness: append digit if collision
    final_abbr := base_abbr;
    cnt := 2;
    WHILE EXISTS (SELECT 1 FROM "Project" WHERE abbreviation = final_abbr) LOOP
      final_abbr := base_abbr || cnt;
      cnt := cnt + 1;
    END LOOP;

    UPDATE "Project" SET abbreviation = final_abbr WHERE id = r.id;
  END LOOP;
END $$;
