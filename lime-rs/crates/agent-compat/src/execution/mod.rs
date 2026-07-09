//! Execution manager stub kept only while Aster subagent execution is removed.

pub mod manager {
    use std::collections::HashMap;
    use std::sync::Arc;

    use anyhow::Result;
    use once_cell::sync::Lazy;
    use tokio::sync::Mutex;

    use crate::agents::types::SharedProvider;
    use crate::agents::Agent;
    use crate::session::InMemoryThreadRuntimeStore;

    pub struct AgentManager {
        agents: Mutex<HashMap<String, Arc<Agent>>>,
    }

    static GLOBAL_AGENT_MANAGER: Lazy<Arc<AgentManager>> = Lazy::new(|| {
        Arc::new(AgentManager {
            agents: Mutex::new(HashMap::new()),
        })
    });

    impl AgentManager {
        pub async fn instance() -> Result<Arc<Self>> {
            Ok(GLOBAL_AGENT_MANAGER.clone())
        }

        pub async fn new_with_thread_runtime_store(
            _provider: Option<SharedProvider>,
            _store: Arc<InMemoryThreadRuntimeStore>,
        ) -> Result<Arc<Self>> {
            Ok(Arc::new(Self {
                agents: Mutex::new(HashMap::new()),
            }))
        }

        pub async fn get_or_create_agent(&self, session_id: String) -> Result<Arc<Agent>> {
            let mut agents = self.agents.lock().await;
            Ok(agents
                .entry(session_id)
                .or_insert_with(|| Arc::new(Agent::new()))
                .clone())
        }
    }
}
