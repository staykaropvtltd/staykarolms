-- Normalize test_questions.options rows where the value was stored as a
-- JSON-encoded string inside the jsonb column instead of a proper array.
--
-- This happens when the frontend sent options as a stringified value
-- (e.g. '"[\"A\",\"B\",\"C\",\"D\"]"' ) which Postgres stored verbatim as a
-- jsonb string node. jsonb_typeof returns 'string' for these rows.
-- `options#>>'{}'` extracts the raw text, which is the JSON array literal,
-- then we cast it back to jsonb.
UPDATE test_questions
SET options = (options #>> '{}')::jsonb
WHERE
  options IS NOT NULL
  AND jsonb_typeof(options) = 'string';
