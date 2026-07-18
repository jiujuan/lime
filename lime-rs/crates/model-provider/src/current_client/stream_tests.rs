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
