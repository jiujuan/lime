use app_server_client::AppServerClient;
use app_server_test_client::sample_capability_list_line;
use app_server_test_client::sample_initialize_line;
use app_server_test_client::sample_initialized_line;
use app_server_test_client::sample_smoke_lines;

fn main() -> anyhow::Result<()> {
    let mut args = std::env::args().skip(1);
    let command = args.next();
    match command.as_deref() {
        None => {
            print!("{}", sample_initialize_line("app-server-test-client")?);
        }
        Some("initialize-line") => {
            let client_name = args
                .next()
                .unwrap_or_else(|| "app-server-test-client".to_string());
            print!("{}", sample_initialize_line(client_name)?);
        }
        Some("initialized-line") => {
            print!("{}", sample_initialized_line()?);
        }
        Some("capability-list-line") => {
            let mut client = AppServerClient::new();
            print!("{}", sample_capability_list_line(&mut client)?);
        }
        Some("smoke-lines") => {
            let client_name = args
                .next()
                .unwrap_or_else(|| "app-server-test-client".to_string());
            for line in sample_smoke_lines(client_name)? {
                print!("{line}");
            }
        }
        Some(client_name) => {
            print!("{}", sample_initialize_line(client_name.to_string())?);
        }
    }
    Ok(())
}
