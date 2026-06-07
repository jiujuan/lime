use crate::models::Provider;
use rusqlite::{params, Connection};
use serde_json::Value;

pub struct ProviderDao;

impl ProviderDao {
    pub fn get_all(conn: &Connection, app_type: &str) -> Result<Vec<Provider>, rusqlite::Error> {
        let mut stmt = conn.prepare(
            "SELECT id, app_type, name, settings_config, category, icon, icon_color,
                    notes, created_at, sort_index, is_current
             FROM providers WHERE app_type = ? ORDER BY sort_index, created_at",
        )?;

        let providers = stmt.query_map([app_type], |row| {
            let settings_str: String = row.get(3)?;
            let settings_config: Value = serde_json::from_str(&settings_str).unwrap_or(Value::Null);

            Ok(Provider {
                id: row.get(0)?,
                app_type: row.get(1)?,
                name: row.get(2)?,
                settings_config,
                category: row.get(4)?,
                icon: row.get(5)?,
                icon_color: row.get(6)?,
                notes: row.get(7)?,
                created_at: row.get(8)?,
                sort_index: row.get(9)?,
                is_current: row.get::<_, i32>(10)? == 1,
            })
        })?;

        providers.collect()
    }

    pub fn get_by_id(
        conn: &Connection,
        app_type: &str,
        id: &str,
    ) -> Result<Option<Provider>, rusqlite::Error> {
        let mut stmt = conn.prepare(
            "SELECT id, app_type, name, settings_config, category, icon, icon_color,
                    notes, created_at, sort_index, is_current
             FROM providers WHERE app_type = ? AND id = ?",
        )?;

        let result = stmt.query_row([app_type, id], |row| {
            let settings_str: String = row.get(3)?;
            let settings_config: Value = serde_json::from_str(&settings_str).unwrap_or(Value::Null);

            Ok(Provider {
                id: row.get(0)?,
                app_type: row.get(1)?,
                name: row.get(2)?,
                settings_config,
                category: row.get(4)?,
                icon: row.get(5)?,
                icon_color: row.get(6)?,
                notes: row.get(7)?,
                created_at: row.get(8)?,
                sort_index: row.get(9)?,
                is_current: row.get::<_, i32>(10)? == 1,
            })
        });

        match result {
            Ok(provider) => Ok(Some(provider)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn insert(conn: &Connection, provider: &Provider) -> Result<(), rusqlite::Error> {
        conn.execute(
            "INSERT INTO providers (id, app_type, name, settings_config, category, icon,
                                   icon_color, notes, created_at, sort_index, is_current)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                provider.id,
                provider.app_type,
                provider.name,
                serde_json::to_string(&provider.settings_config).unwrap_or_default(),
                provider.category,
                provider.icon,
                provider.icon_color,
                provider.notes,
                provider.created_at,
                provider.sort_index,
                if provider.is_current { 1 } else { 0 },
            ],
        )?;
        Ok(())
    }

    pub fn update(conn: &Connection, provider: &Provider) -> Result<(), rusqlite::Error> {
        conn.execute(
            "UPDATE providers SET name = ?1, settings_config = ?2, category = ?3,
                                 icon = ?4, icon_color = ?5, notes = ?6, sort_index = ?7
             WHERE id = ?8 AND app_type = ?9",
            params![
                provider.name,
                serde_json::to_string(&provider.settings_config).unwrap_or_default(),
                provider.category,
                provider.icon,
                provider.icon_color,
                provider.notes,
                provider.sort_index,
                provider.id,
                provider.app_type,
            ],
        )?;
        Ok(())
    }

    pub fn delete(conn: &Connection, app_type: &str, id: &str) -> Result<(), rusqlite::Error> {
        conn.execute(
            "DELETE FROM providers WHERE app_type = ? AND id = ?",
            [app_type, id],
        )?;
        Ok(())
    }

    pub fn set_current(conn: &Connection, app_type: &str, id: &str) -> Result<(), rusqlite::Error> {
        // 先清除所有 is_current
        conn.execute(
            "UPDATE providers SET is_current = 0 WHERE app_type = ?",
            [app_type],
        )?;
        // 设置新的 current
        conn.execute(
            "UPDATE providers SET is_current = 1 WHERE app_type = ? AND id = ?",
            [app_type, id],
        )?;
        Ok(())
    }

    pub fn get_current(
        conn: &Connection,
        app_type: &str,
    ) -> Result<Option<Provider>, rusqlite::Error> {
        let mut stmt = conn.prepare(
            "SELECT id, app_type, name, settings_config, category, icon, icon_color,
                    notes, created_at, sort_index, is_current
             FROM providers WHERE app_type = ? AND is_current = 1",
        )?;

        let result = stmt.query_row([app_type], |row| {
            let settings_str: String = row.get(3)?;
            let settings_config: Value = serde_json::from_str(&settings_str).unwrap_or(Value::Null);

            Ok(Provider {
                id: row.get(0)?,
                app_type: row.get(1)?,
                name: row.get(2)?,
                settings_config,
                category: row.get(4)?,
                icon: row.get(5)?,
                icon_color: row.get(6)?,
                notes: row.get(7)?,
                created_at: row.get(8)?,
                sort_index: row.get(9)?,
                is_current: true,
            })
        });

        match result {
            Ok(provider) => Ok(Some(provider)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }
}
