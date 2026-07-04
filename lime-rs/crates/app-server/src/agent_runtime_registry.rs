use lime_core::database::DbConnection;

pub(crate) fn initialize_agent_runtime(db: DbConnection) -> Result<(), String> {
    lime_agent::initialize_agent_runtime(db)
}
