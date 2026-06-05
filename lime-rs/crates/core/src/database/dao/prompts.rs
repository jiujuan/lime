use crate::models::Prompt;
use rusqlite::{params, Connection};
use std::collections::HashMap;

pub struct PromptDao;

impl PromptDao {
    /// Get all prompts for an app type
    pub fn get_all(conn: &Connection, app_type: &str) -> Result<Vec<Prompt>, rusqlite::Error> {
        let mut stmt = conn.prepare(
            "SELECT id, app_type, name, content, description, enabled, created_at, updated_at
             FROM prompts WHERE app_type = ? ORDER BY created_at",
        )?;

        let prompts = stmt.query_map([app_type], |row| {
            Ok(Prompt {
                id: row.get(0)?,
                app_type: row.get(1)?,
                name: row.get(2)?,
                content: row.get(3)?,
                description: row.get(4)?,
                enabled: row.get::<_, i32>(5)? == 1,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        prompts.collect()
    }

    /// Get all prompts as a HashMap (id -> Prompt)
    pub fn get_all_map(
        conn: &Connection,
        app_type: &str,
    ) -> Result<HashMap<String, Prompt>, rusqlite::Error> {
        let prompts = Self::get_all(conn, app_type)?;
        Ok(prompts.into_iter().map(|p| (p.id.clone(), p)).collect())
    }

    /// Get a single prompt by id
    pub fn get_by_id(
        conn: &Connection,
        app_type: &str,
        id: &str,
    ) -> Result<Option<Prompt>, rusqlite::Error> {
        let mut stmt = conn.prepare(
            "SELECT id, app_type, name, content, description, enabled, created_at, updated_at
             FROM prompts WHERE app_type = ? AND id = ?",
        )?;

        let mut rows = stmt.query([app_type, id])?;

        if let Some(row) = rows.next()? {
            Ok(Some(Prompt {
                id: row.get(0)?,
                app_type: row.get(1)?,
                name: row.get(2)?,
                content: row.get(3)?,
                description: row.get(4)?,
                enabled: row.get::<_, i32>(5)? == 1,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Get the currently enabled prompt
    pub fn get_enabled(
        conn: &Connection,
        app_type: &str,
    ) -> Result<Option<Prompt>, rusqlite::Error> {
        let mut stmt = conn.prepare(
            "SELECT id, app_type, name, content, description, enabled, created_at, updated_at
             FROM prompts WHERE app_type = ? AND enabled = 1",
        )?;

        let mut rows = stmt.query([app_type])?;

        if let Some(row) = rows.next()? {
            Ok(Some(Prompt {
                id: row.get(0)?,
                app_type: row.get(1)?,
                name: row.get(2)?,
                content: row.get(3)?,
                description: row.get(4)?,
                enabled: row.get::<_, i32>(5)? == 1,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Insert or update a prompt (upsert)
    pub fn upsert(conn: &Connection, prompt: &Prompt) -> Result<(), rusqlite::Error> {
        conn.execute(
            "INSERT INTO prompts (id, app_type, name, content, description, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id, app_type) DO UPDATE SET
                name = excluded.name,
                content = excluded.content,
                description = excluded.description,
                enabled = excluded.enabled,
                updated_at = excluded.updated_at",
            params![
                prompt.id,
                prompt.app_type,
                prompt.name,
                prompt.content,
                prompt.description,
                if prompt.enabled { 1 } else { 0 },
                prompt.created_at,
                prompt.updated_at,
            ],
        )?;
        Ok(())
    }

    /// Insert a new prompt
    pub fn insert(conn: &Connection, prompt: &Prompt) -> Result<(), rusqlite::Error> {
        conn.execute(
            "INSERT INTO prompts (id, app_type, name, content, description, enabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                prompt.id,
                prompt.app_type,
                prompt.name,
                prompt.content,
                prompt.description,
                if prompt.enabled { 1 } else { 0 },
                prompt.created_at,
                prompt.updated_at,
            ],
        )?;
        Ok(())
    }

    /// Update an existing prompt
    pub fn update(conn: &Connection, prompt: &Prompt) -> Result<(), rusqlite::Error> {
        conn.execute(
            "UPDATE prompts SET name = ?1, content = ?2, description = ?3, enabled = ?4, updated_at = ?5
             WHERE id = ?6 AND app_type = ?7",
            params![
                prompt.name,
                prompt.content,
                prompt.description,
                if prompt.enabled { 1 } else { 0 },
                prompt.updated_at,
                prompt.id,
                prompt.app_type,
            ],
        )?;
        Ok(())
    }

    /// Delete a prompt
    pub fn delete(conn: &Connection, app_type: &str, id: &str) -> Result<(), rusqlite::Error> {
        conn.execute(
            "DELETE FROM prompts WHERE app_type = ? AND id = ?",
            [app_type, id],
        )?;
        Ok(())
    }

    /// Disable all prompts for an app type
    pub fn disable_all(conn: &Connection, app_type: &str) -> Result<(), rusqlite::Error> {
        conn.execute(
            "UPDATE prompts SET enabled = 0 WHERE app_type = ?",
            [app_type],
        )?;
        Ok(())
    }

    /// Enable a specific prompt (and disable all others)
    pub fn enable(conn: &Connection, app_type: &str, id: &str) -> Result<(), rusqlite::Error> {
        // First disable all
        Self::disable_all(conn, app_type)?;
        // Then enable the specific one
        conn.execute(
            "UPDATE prompts SET enabled = 1 WHERE app_type = ? AND id = ?",
            [app_type, id],
        )?;
        Ok(())
    }

    // Legacy method for compatibility
    #[allow(dead_code)]
    pub fn set_current(conn: &Connection, app_type: &str, id: &str) -> Result<(), rusqlite::Error> {
        Self::enable(conn, app_type, id)
    }
}
