const TEST_FIXTURE_FILE_PATTERN =
  /(?:^|[._-])test[-_]?fixtures?\.(?:[cm]?[jt]sx?)$/i;

export function isVitestRunnableTestFile(filePath) {
  const normalized = String(filePath || "").replaceAll("\\", "/");
  const fileName = normalized.split("/").pop() ?? normalized;
  return !TEST_FIXTURE_FILE_PATTERN.test(fileName);
}
