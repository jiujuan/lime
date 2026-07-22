use super::{
    stream::{anthropic_sse, openai_chat_sse, responses_sse},
    CurrentProviderError,
};
use futures::{Stream, StreamExt};
use reqwest::{Client, Response};
use runtime_core::CanonicalLlmEvent;
use std::pin::Pin;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::oneshot,
    time::{timeout, Duration},
};

type TestProviderStream =
    Pin<Box<dyn Stream<Item = Result<CanonicalLlmEvent, CurrentProviderError>> + Send + 'static>>;

async fn collect_openai_events(body: &'static str) -> Vec<CanonicalLlmEvent> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind fixture server");
    let address = listener.local_addr().expect("fixture address");
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.expect("accept request");
        let mut request = Vec::new();
        let mut buffer = [0_u8; 1024];
        while !request.windows(4).any(|window| window == b"\r\n\r\n") {
            let read = socket.read(&mut buffer).await.expect("read request");
            if read == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..read]);
        }

        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len(),
        );
        socket
            .write_all(response.as_bytes())
            .await
            .expect("write response");
    });

    let response = Client::builder()
        .no_proxy()
        .build()
        .expect("HTTP client")
        .get(format!("http://{address}"))
        .send()
        .await
        .expect("SSE response");
    let events = openai_chat_sse(response)
        .map(|event| event.expect("valid OpenAI-compatible SSE event"))
        .collect()
        .await;
    server.await.expect("fixture server");
    events
}

async fn assert_finish_releases_http_body(
    body: &'static str,
    stream_from_response: impl FnOnce(Response) -> TestProviderStream,
) {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind fixture server");
    let address = listener.local_addr().expect("fixture address");
    let (peer_closed_tx, peer_closed_rx) = oneshot::channel();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.expect("accept request");
        let mut request = Vec::new();
        let mut buffer = [0_u8; 1024];
        while !request.windows(4).any(|window| window == b"\r\n\r\n") {
            let read = socket.read(&mut buffer).await.expect("read request");
            if read == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..read]);
        }

        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\nConnection: keep-alive\r\n\r\n{:X}\r\n{body}\r\n",
            body.len(),
        );
        socket
            .write_all(response.as_bytes())
            .await
            .expect("write response");

        let peer_closed = socket.read(&mut buffer).await.expect("read peer close") == 0;
        let _ = peer_closed_tx.send(peer_closed);
    });

    let client = Client::builder()
        .no_proxy()
        .pool_idle_timeout(Duration::from_secs(300))
        .build()
        .expect("HTTP client");
    let response = client
        .get(format!("http://{address}"))
        .send()
        .await
        .expect("SSE response");
    let mut stream = stream_from_response(response);
    while let Some(event) = stream.next().await {
        if matches!(
            event.expect("provider event"),
            CanonicalLlmEvent::Finish { .. }
        ) {
            break;
        }
    }

    assert!(timeout(Duration::from_secs(2), peer_closed_rx)
        .await
        .expect("provider connection should close before another stream poll")
        .expect("peer close signal"));
    server.await.expect("fixture server");
}

#[tokio::test]
async fn openai_finish_releases_http_body_before_consumer_polls_again() {
    assert_finish_releases_http_body(
        concat!(
            "data: {\"id\":\"chatcmpl-close\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"fixture\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"done\"},\"finish_reason\":\"stop\"}]}\n\n",
            "data: [DONE]\n\n"
        ),
        |response| Box::pin(openai_chat_sse(response)),
    )
    .await;
}

#[tokio::test]
async fn openai_chunk_without_id_keeps_valid_delta_and_finish_reason() {
    let events = collect_openai_events(concat!(
        "data: {\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-5.6-sol\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"你好\"},\"finish_reason\":\"stop\"}]}\n\n",
        "data: [DONE]\n\n",
    ))
    .await;

    assert_eq!(events.len(), 4);
    assert!(matches!(
        &events[0],
        CanonicalLlmEvent::TextStart { id } if id == "text-0"
    ));
    assert!(matches!(
        &events[1],
        CanonicalLlmEvent::TextDelta { id, text } if id == "text-0" && text == "你好"
    ));
    assert!(matches!(
        &events[2],
        CanonicalLlmEvent::TextEnd { id } if id == "text-0"
    ));
    assert!(matches!(
        &events[3],
        CanonicalLlmEvent::Finish {
            response_id: None,
            ..
        }
    ));
}

#[tokio::test]
async fn openai_null_id_does_not_clear_an_id_from_an_earlier_chunk() {
    let events = collect_openai_events(concat!(
        "data: {\"id\":\"chatcmpl-keep\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"fixture\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"ok\"},\"finish_reason\":null}]}\n\n",
        "data: {\"id\":null,\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"fixture\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
        "data: [DONE]\n\n",
    ))
    .await;

    assert!(matches!(
        events.last(),
        Some(CanonicalLlmEvent::Finish {
            response_id: Some(response_id),
            ..
        }) if response_id == "chatcmpl-keep"
    ));
}

#[tokio::test]
async fn openai_finish_reason_is_terminal_without_done_sentinel() {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind fixture server");
    let address = listener.local_addr().expect("fixture address");
    let (peer_closed_tx, peer_closed_rx) = oneshot::channel();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.expect("accept request");
        let mut request = Vec::new();
        let mut buffer = [0_u8; 1024];
        while !request.windows(4).any(|window| window == b"\r\n\r\n") {
            let read = socket.read(&mut buffer).await.expect("read request");
            if read == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..read]);
        }

        let body = concat!(
            "data: {\"id\":\"chatcmpl-finish-only\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"fixture\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"done\"},\"finish_reason\":\"stop\"}]}\n\n",
            "data: {\"id\":\"chatcmpl-finish-only\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"fixture\",\"choices\":[],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":3,\"total_tokens\":10}}\n\n",
        );
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\nConnection: keep-alive\r\n\r\n{:X}\r\n{body}\r\n",
            body.len(),
        );
        socket
            .write_all(response.as_bytes())
            .await
            .expect("write response");

        let peer_closed = socket.read(&mut buffer).await.expect("read peer close") == 0;
        let _ = peer_closed_tx.send(peer_closed);
    });

    let client = Client::builder()
        .no_proxy()
        .pool_idle_timeout(Duration::from_secs(300))
        .build()
        .expect("HTTP client");
    let response = client
        .get(format!("http://{address}"))
        .send()
        .await
        .expect("SSE response");
    let mut stream = Box::pin(openai_chat_sse(response));
    let terminal = timeout(Duration::from_secs(1), async {
        while let Some(event) = stream.next().await {
            if matches!(
                event.expect("provider event"),
                CanonicalLlmEvent::Finish {
                    usage: Some(usage),
                    ..
                } if usage.input_tokens == Some(7) && usage.output_tokens == Some(3)
            ) {
                return true;
            }
        }
        false
    })
    .await
    .expect("finish_reason should terminate the stream without [DONE]");
    drop(stream);

    assert!(terminal);
    assert!(timeout(Duration::from_secs(2), peer_closed_rx)
        .await
        .expect("provider connection should close after finish_reason")
        .expect("peer close signal"));
    server.await.expect("fixture server");
}

#[tokio::test]
async fn responses_finish_releases_http_body_before_consumer_polls_again() {
    assert_finish_releases_http_body(
        "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp-close\",\"output\":[]}}\n\n",
        |response| Box::pin(responses_sse(response)),
    )
    .await;
}

#[tokio::test]
async fn anthropic_finish_releases_http_body_before_consumer_polls_again() {
    assert_finish_releases_http_body("data: {\"type\":\"message_stop\"}\n\n", |response| {
        Box::pin(anthropic_sse(response))
    })
    .await;
}
