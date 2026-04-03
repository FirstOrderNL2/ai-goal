
-- 1. Merge legacy Football League Championship teams into Championship
-- Update teams that exist in both by merging api_football_id from Championship to legacy if needed
-- Then update all references and delete duplicates

-- First, update matches that reference legacy team IDs to use Championship team IDs where both exist
-- Coventry City (legacy, no api_id) → Coventry (Championship, api_id=1346)
UPDATE matches SET team_home_id = '62a13c7d-bfee-4cc2-a95a-0026fc6aceca' WHERE team_home_id = '9ff2a7d1-48fe-4392-943c-cf26cd6397e4';
UPDATE matches SET team_away_id = '62a13c7d-bfee-4cc2-a95a-0026fc6aceca' WHERE team_away_id = '9ff2a7d1-48fe-4392-943c-cf26cd6397e4';

-- Derby County (legacy, no api_id) → Derby (Championship, api_id=69)
UPDATE matches SET team_home_id = 'de3db8fb-2a6e-4f9e-afa0-5992dfb9325a' WHERE team_home_id = '1b54d199-afec-434c-8996-191d50145794';
UPDATE matches SET team_away_id = 'de3db8fb-2a6e-4f9e-afa0-5992dfb9325a' WHERE team_away_id = '1b54d199-afec-434c-8996-191d50145794';

-- Preston North End (legacy, no api_id) → Preston (Championship, api_id=59)
UPDATE matches SET team_home_id = '33467a7b-02a3-4a5a-aca0-15886392780e' WHERE team_home_id = 'f5bf1b82-4dc4-4898-80d4-a233a9c254ff';
UPDATE matches SET team_away_id = '33467a7b-02a3-4a5a-aca0-15886392780e' WHERE team_away_id = 'f5bf1b82-4dc4-4898-80d4-a233a9c254ff';

-- For legacy teams WITH api_football_id that don't have a Championship counterpart, update their league
-- Hull City (64), Middlesbrough (70), Millwall (58), Oxford United (1338)
UPDATE teams SET league = 'Championship' WHERE id IN (
  '44564b1a-de31-4da1-9c4c-75b8654ac2cd',  -- Hull City
  '2802d5be-f744-4557-9d56-75badfda73b1',  -- Middlesbrough
  'bde8c1ac-8cbe-4555-916e-b5eccfb8d785',  -- Millwall
  '0197b335-c05f-4700-83f3-5941dda77597'   -- Oxford United
) AND league = 'Football League Championship';

-- Also update any matches from legacy league name
UPDATE matches SET league = 'Championship' WHERE league = 'Football League Championship';

-- Delete the now-orphaned legacy duplicate teams (the ones merged into Championship counterparts)
DELETE FROM teams WHERE id IN (
  '9ff2a7d1-48fe-4392-943c-cf26cd6397e4',  -- Coventry City (legacy dup)
  '1b54d199-afec-434c-8996-191d50145794',  -- Derby County (legacy dup)
  'f5bf1b82-4dc4-4898-80d4-a233a9c254ff'   -- Preston North End (legacy dup)
);

-- 2. Add multi-goal-line prediction columns
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS goal_lines jsonb DEFAULT NULL;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS goal_distribution jsonb DEFAULT NULL;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS best_pick text DEFAULT NULL;
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS best_pick_confidence numeric DEFAULT NULL;
