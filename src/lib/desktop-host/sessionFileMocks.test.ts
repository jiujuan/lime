import { describe, expect, it } from "vitest";
import { sessionFileMocks } from "./sessionFileMocks";

describe("sessionFileMocks", () => {
  it("不再注册会话文件旧命令默认 mock", () => {
    expect(sessionFileMocks).not.toHaveProperty("session_files_get_or_create");
    expect(sessionFileMocks).not.toHaveProperty("session_files_update_meta");
    expect(sessionFileMocks).not.toHaveProperty("session_files_list_files");
    expect(sessionFileMocks).not.toHaveProperty("session_files_save_file");
    expect(sessionFileMocks).not.toHaveProperty("session_files_read_file");
    expect(sessionFileMocks).not.toHaveProperty(
      "session_files_resolve_file_path",
    );
    expect(sessionFileMocks).not.toHaveProperty("session_files_delete_file");
    expect(sessionFileMocks).not.toHaveProperty("upload_image_to_session");
    expect(sessionFileMocks).not.toHaveProperty("read_image_from_session");
    expect(sessionFileMocks).not.toHaveProperty("import_document");
    expect(sessionFileMocks).not.toHaveProperty("import_document_to_session");
  });
});
