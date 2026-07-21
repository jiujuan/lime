use super::forward_incoming_message;
use super::next_connection_id;
use super::ConnectionOrigin;
use super::TransportEvent;
use crate::decode_message;
use crate::encode_message;
use crate::serialize_outgoing_message;
use crate::QueuedOutgoingMessage;
use crate::CHANNEL_CAPACITY;
use app_server_protocol::InitializeParams;
use app_server_protocol::JsonRpcMessage;
use app_server_protocol::JsonRpcRequest;
use std::io::{BufRead, Write};
use tokio::io::AsyncBufReadExt;
use tokio::io::AsyncRead;
use tokio::io::AsyncWrite;
use tokio::io::AsyncWriteExt;
use tokio::io::BufReader;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

#[derive(Debug, Default, Clone, Copy)]
pub struct StdioConnection;

impl StdioConnection {
    pub fn read_message(reader: &mut impl BufRead) -> Result<Option<JsonRpcMessage>, String> {
        let mut line = String::new();
        let bytes = reader
            .read_line(&mut line)
            .map_err(|error| format!("failed to read app-server stdio line: {error}"))?;
        if bytes == 0 {
            return Ok(None);
        }
        decode_message(&line)
            .map(Some)
            .map_err(|error| format!("failed to decode app-server stdio line: {error}"))
    }

    pub fn write_message(writer: &mut impl Write, message: &JsonRpcMessage) -> Result<(), String> {
        let line = encode_message(message)
            .map_err(|error| format!("failed to encode app-server stdio line: {error}"))?;
        writer
            .write_all(line.as_bytes())
            .map_err(|error| format!("failed to write app-server stdio line: {error}"))
    }
}

pub async fn start_stdio_connection<R, W>(
    transport_event_tx: mpsc::Sender<TransportEvent>,
    reader: R,
    writer: W,
) -> Result<Vec<JoinHandle<()>>, std::io::Error>
where
    R: AsyncRead + Unpin + Send + 'static,
    W: AsyncWrite + Unpin + Send + 'static,
{
    let connection_id = next_connection_id();
    let (writer_tx, writer_rx) = mpsc::channel::<QueuedOutgoingMessage>(CHANNEL_CAPACITY);
    let writer_tx_for_reader = writer_tx.clone();
    transport_event_tx
        .send(TransportEvent::ConnectionOpened {
            connection_id,
            origin: ConnectionOrigin::Stdio,
            writer: writer_tx,
            disconnect_sender: None,
        })
        .await
        .map_err(|_| {
            std::io::Error::new(
                std::io::ErrorKind::BrokenPipe,
                "app-server processor unavailable",
            )
        })?;

    let reader_handle = tokio::spawn(run_stdio_reader(
        transport_event_tx.clone(),
        writer_tx_for_reader,
        connection_id,
        reader,
    ));
    let writer_handle = tokio::spawn(run_stdio_writer(writer_rx, writer));

    Ok(vec![reader_handle, writer_handle])
}

async fn run_stdio_reader<R>(
    transport_event_tx: mpsc::Sender<TransportEvent>,
    writer_tx: mpsc::Sender<QueuedOutgoingMessage>,
    connection_id: crate::ConnectionId,
    reader: R,
) where
    R: AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    let mut initialized_client_name = false;
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                if !initialized_client_name {
                    if let Some(client_name) = extract_stdio_initialize_client_name(&line) {
                        initialized_client_name = true;
                        let _ = transport_event_tx
                            .send(TransportEvent::StdioClientInitialized {
                                connection_id,
                                client_name,
                            })
                            .await;
                    }
                }
                if !forward_incoming_message(&transport_event_tx, &writer_tx, connection_id, &line)
                    .await
                {
                    break;
                }
            }
            Ok(None) | Err(_) => break,
        }
    }

    let _ = transport_event_tx
        .send(TransportEvent::ConnectionClosed { connection_id })
        .await;
}

async fn run_stdio_writer<W>(mut writer_rx: mpsc::Receiver<QueuedOutgoingMessage>, mut writer: W)
where
    W: AsyncWrite + Unpin,
{
    while let Some(queued_message) = writer_rx.recv().await {
        let Some(line) = serialize_outgoing_message(queued_message.message) else {
            continue;
        };
        if writer.write_all(line.as_bytes()).await.is_err() {
            break;
        }
        if writer.flush().await.is_err() {
            break;
        }
        if let Some(write_complete_tx) = queued_message.write_complete_tx {
            let _ = write_complete_tx.send(());
        }
    }
}

pub fn extract_stdio_initialize_client_name(line: &str) -> Option<String> {
    let message = decode_message(line).ok()?;
    let JsonRpcMessage::Request(JsonRpcRequest { method, params, .. }) = message else {
        return None;
    };
    if method != app_server_protocol::METHOD_INITIALIZE {
        return None;
    }
    let params = serde_json::from_value::<InitializeParams>(params?).ok()?;
    Some(params.client_info.name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::OutgoingMessage;
    use app_server_protocol::ClientCapabilities;
    use app_server_protocol::ClientInfo;
    use app_server_protocol::JsonRpcRequest;
    use app_server_protocol::RequestId;
    use serde_json::json;
    use std::io::Cursor;
    use tokio::io::AsyncWriteExt;

    #[test]
    fn stdio_connection_reads_and_writes_jsonl_messages() {
        let message = JsonRpcMessage::Request(JsonRpcRequest::new(
            RequestId::Integer(1),
            app_server_protocol::METHOD_INITIALIZE,
            Some(json!({
                "clientInfo": { "name": "fixture" },
                "capabilities": {}
            })),
        ));
        let mut output = Vec::new();
        StdioConnection::write_message(&mut output, &message).expect("write");

        let mut input = Cursor::new(output);
        assert_eq!(
            StdioConnection::read_message(&mut input).expect("read"),
            Some(message)
        );
        assert_eq!(
            StdioConnection::read_message(&mut input).expect("eof"),
            None
        );
    }

    #[test]
    fn extracts_client_name_from_initialize_line_only() {
        let initialize = JsonRpcMessage::Request(JsonRpcRequest::new(
            RequestId::Integer(1),
            app_server_protocol::METHOD_INITIALIZE,
            Some(
                serde_json::to_value(InitializeParams {
                    client_info: ClientInfo {
                        name: "desktop".to_string(),
                        title: None,
                        version: None,
                    },
                    capabilities: ClientCapabilities::default(),
                })
                .expect("params"),
            ),
        ));
        let line = encode_message(&initialize).expect("line");

        assert_eq!(
            extract_stdio_initialize_client_name(&line),
            Some("desktop".to_string())
        );
        assert_eq!(
            extract_stdio_initialize_client_name("{\"method\":\"initialized\"}\n"),
            None
        );
    }

    #[tokio::test]
    async fn stdio_connection_emits_lifecycle_events_and_writes_queue_messages() {
        let (mut input_client, input_server) = tokio::io::duplex(4096);
        let (output_server, mut output_client) = tokio::io::duplex(4096);
        let (event_tx, mut event_rx) = mpsc::channel(8);

        let handles = start_stdio_connection(event_tx, input_server, output_server)
            .await
            .expect("start stdio");

        let (connection_id, writer) = match event_rx.recv().await.expect("opened") {
            TransportEvent::ConnectionOpened {
                connection_id,
                origin: ConnectionOrigin::Stdio,
                writer,
                ..
            } => (connection_id, writer),
            other => panic!("expected opened event, got {other:?}"),
        };

        let initialize = JsonRpcMessage::Request(JsonRpcRequest::new(
            RequestId::Integer(1),
            app_server_protocol::METHOD_INITIALIZE,
            Some(json!({
                "clientInfo": { "name": "fixture-stdio" },
                "capabilities": {}
            })),
        ));
        input_client
            .write_all(encode_message(&initialize).expect("line").as_bytes())
            .await
            .expect("write initialize");

        match event_rx.recv().await.expect("client initialized") {
            TransportEvent::StdioClientInitialized {
                connection_id: actual_connection_id,
                client_name,
            } => {
                assert_eq!(actual_connection_id, connection_id);
                assert_eq!(client_name, "fixture-stdio");
            }
            other => panic!("expected client initialized event, got {other:?}"),
        }
        match event_rx.recv().await.expect("incoming") {
            TransportEvent::IncomingMessage {
                connection_id: actual_connection_id,
                message,
            } => {
                assert_eq!(actual_connection_id, connection_id);
                assert_eq!(message, initialize);
            }
            other => panic!("expected incoming event, got {other:?}"),
        }

        writer
            .send(QueuedOutgoingMessage::new(OutgoingMessage::from(
                JsonRpcMessage::Notification(app_server_protocol::JsonRpcNotification::new(
                    app_server_protocol::METHOD_INITIALIZED,
                    None,
                )),
            )))
            .await
            .expect("queue outgoing");
        let mut line = String::new();
        let mut output_reader = BufReader::new(&mut output_client);
        output_reader
            .read_line(&mut line)
            .await
            .expect("read output");
        assert_eq!(
            decode_message(&line).expect("decode output"),
            JsonRpcMessage::Notification(app_server_protocol::JsonRpcNotification::new(
                app_server_protocol::METHOD_INITIALIZED,
                None,
            ))
        );

        drop(input_client);
        match event_rx.recv().await.expect("closed") {
            TransportEvent::ConnectionClosed {
                connection_id: actual_connection_id,
            } => assert_eq!(actual_connection_id, connection_id),
            other => panic!("expected closed event, got {other:?}"),
        }
        drop(writer);
        for handle in handles {
            handle.await.expect("stdio task");
        }
    }
}
