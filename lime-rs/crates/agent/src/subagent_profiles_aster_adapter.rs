use crate::subagent_profiles::SubagentCustomizationState;
use aster::session::extension_data::{ExtensionData, ExtensionState};
use aster::session::Session;

impl ExtensionState for SubagentCustomizationState {
    const EXTENSION_NAME: &'static str = "subagent_customization";
    const VERSION: &'static str = "v0";
}

fn subagent_customization_from_extension_data(
    extension_data: &ExtensionData,
) -> Option<SubagentCustomizationState> {
    <SubagentCustomizationState as ExtensionState>::from_extension_data(extension_data)
}

pub(crate) fn subagent_customization_from_session(
    session: &Session,
) -> Option<SubagentCustomizationState> {
    subagent_customization_from_extension_data(&session.extension_data)
}

#[cfg(test)]
fn write_subagent_customization_extension_data(
    customization: &SubagentCustomizationState,
    extension_data: &mut ExtensionData,
) -> Result<(), String> {
    <SubagentCustomizationState as ExtensionState>::to_extension_data(customization, extension_data)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
pub(crate) fn updated_extension_data_for_subagent_customization(
    customization: SubagentCustomizationState,
    session: &Session,
) -> Result<ExtensionData, String> {
    let mut extension_data = session.extension_data.clone();
    write_subagent_customization_extension_data(&customization, &mut extension_data)?;
    Ok(extension_data)
}
