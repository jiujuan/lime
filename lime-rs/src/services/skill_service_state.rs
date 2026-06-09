use std::sync::Arc;

use lime_services::skill_service::SkillService;

pub struct SkillServiceState(pub Arc<SkillService>);
