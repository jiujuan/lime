use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::JsonRpcNotification;

use super::AppServerNotificationMethod;

macro_rules! app_server_client_notification_definitions {
    ($($variant:ident => $wire:literal),* $(,)?) => {
        #[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
        #[serde(tag = "method", content = "params")]
        pub enum ClientNotification {
            $(
                #[serde(rename = $wire)]
                $variant,
            )*
        }

        impl ClientNotification {
            pub fn method(&self) -> AppServerNotificationMethod {
                match self {
                    $(Self::$variant => AppServerNotificationMethod::$variant,)*
                }
            }
        }

        impl TryFrom<JsonRpcNotification> for ClientNotification {
            type Error = String;

            fn try_from(notification: JsonRpcNotification) -> Result<Self, Self::Error> {
                match AppServerNotificationMethod::parse(&notification.method) {
                    $(
                        Some(AppServerNotificationMethod::$variant) => Ok(Self::$variant),
                    )*
                    Some(method) => Err(format!(
                        "notification is not a client notification: {}",
                        method.as_str()
                    )),
                    None => Err(format!("unknown notification method: {}", notification.method)),
                }
            }
        }

        impl From<ClientNotification> for JsonRpcNotification {
            fn from(notification: ClientNotification) -> Self {
                match notification {
                    $(ClientNotification::$variant => JsonRpcNotification::new($wire, None),)*
                }
            }
        }
    };
}

app_server_client_notification_definitions! {
    Initialized => "initialized",
}
