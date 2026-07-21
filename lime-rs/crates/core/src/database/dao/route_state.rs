use rusqlite::{params, types::Type, Connection, OptionalExtension};

const MODEL_ROUTE_GENERATION_KEY: &str = "model_route_generation";

pub struct RouteStateDao;

impl RouteStateDao {
    pub fn read_generation(conn: &Connection) -> Result<u64, rusqlite::Error> {
        let value = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                [MODEL_ROUTE_GENERATION_KEY],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        value.map_or(Ok(0), |value| {
            value.parse::<u64>().map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(0, Type::Text, Box::new(error))
            })
        })
    }

    pub fn advance_generation(conn: &Connection) -> Result<u64, rusqlite::Error> {
        let generation = Self::read_generation(conn)?.checked_add(1).ok_or_else(|| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "model route generation overflow",
            )))
        })?;

        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![MODEL_ROUTE_GENERATION_KEY, generation.to_string()],
        )?;

        Ok(generation)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_schema(conn: &Connection) {
        crate::database::schema::create_tables(conn).expect("create database schema");
    }

    #[test]
    fn missing_generation_starts_at_zero_and_advances_strictly() {
        let conn = Connection::open_in_memory().expect("open database");
        create_schema(&conn);

        assert_eq!(RouteStateDao::read_generation(&conn).unwrap(), 0);
        assert_eq!(RouteStateDao::advance_generation(&conn).unwrap(), 1);
        assert_eq!(RouteStateDao::advance_generation(&conn).unwrap(), 2);
        assert_eq!(RouteStateDao::read_generation(&conn).unwrap(), 2);
    }

    #[test]
    fn rolled_back_advance_is_not_visible() {
        let mut conn = Connection::open_in_memory().expect("open database");
        create_schema(&conn);

        {
            let transaction = conn.transaction().expect("start transaction");
            assert_eq!(RouteStateDao::advance_generation(&transaction).unwrap(), 1);
            transaction.rollback().expect("roll back generation");
        }

        assert_eq!(RouteStateDao::read_generation(&conn).unwrap(), 0);
    }

    #[test]
    fn generation_survives_database_reopen() {
        let temp_dir = tempfile::tempdir().expect("create database fixture directory");
        let database_path = temp_dir.path().join("route-state.db");

        {
            let conn = Connection::open(&database_path).expect("open database");
            create_schema(&conn);
            assert_eq!(RouteStateDao::advance_generation(&conn).unwrap(), 1);
        }

        let conn = Connection::open(&database_path).expect("reopen database");
        assert_eq!(RouteStateDao::read_generation(&conn).unwrap(), 1);
    }

    #[test]
    fn invalid_generation_fails_closed() {
        let conn = Connection::open_in_memory().expect("open database");
        create_schema(&conn);
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)",
            params![MODEL_ROUTE_GENERATION_KEY, "invalid"],
        )
        .expect("insert invalid generation");

        assert!(RouteStateDao::read_generation(&conn).is_err());
        assert!(RouteStateDao::advance_generation(&conn).is_err());

        let value: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                [MODEL_ROUTE_GENERATION_KEY],
                |row| row.get(0),
            )
            .expect("read stored generation");
        assert_eq!(value, "invalid");
    }

    #[test]
    fn generation_overflow_fails_closed() {
        let conn = Connection::open_in_memory().expect("open database");
        create_schema(&conn);
        let maximum = u64::MAX.to_string();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)",
            params![MODEL_ROUTE_GENERATION_KEY, maximum],
        )
        .expect("insert maximum generation");

        assert_eq!(RouteStateDao::read_generation(&conn).unwrap(), u64::MAX);
        assert!(RouteStateDao::advance_generation(&conn).is_err());
        assert_eq!(RouteStateDao::read_generation(&conn).unwrap(), u64::MAX);
    }
}
