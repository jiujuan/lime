let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) {
  input += chunk;
}

const request = JSON.parse(input || "{}");

console.log(
  JSON.stringify({
    status: "completed",
    summary: `Prepared prompt context for ${request.taskKind ?? "content task"}`,
    hookKey: request.hookKey,
    hookEvent: request.hookEvent,
    taskId: request.taskId,
  }),
);
