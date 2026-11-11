-- 001_create_tasks.sql
-- Core table for the task manager. Forward-only migration: applied once, inside a
-- transaction, by the backend migration runner (tracked in schema_migrations).

CREATE TABLE tasks (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    title       VARCHAR(200) NOT NULL,
    description TEXT         NOT NULL DEFAULT '',
    status      TEXT         NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- Defence in depth: the API validates input, the database enforces the same rules.
    CONSTRAINT tasks_title_not_blank CHECK (char_length(btrim(title)) > 0),
    CONSTRAINT tasks_description_len CHECK (char_length(description) <= 2000),
    CONSTRAINT tasks_status_valid    CHECK (status IN ('pending', 'completed'))
);

-- Default listing is newest first, optionally filtered by status.
CREATE INDEX tasks_created_at_idx ON tasks (created_at DESC);
CREATE INDEX tasks_status_created_at_idx ON tasks (status, created_at DESC);

-- Keep updated_at correct regardless of which code path performs the UPDATE.
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_set_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
