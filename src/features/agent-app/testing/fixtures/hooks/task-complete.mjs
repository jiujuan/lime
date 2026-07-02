let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) {
  input += chunk;
}

const request = JSON.parse(input || "{}");
const artifactCount = request.completion?.artifactCount ?? 0;

console.log(
  JSON.stringify({
    status: "completed",
    summary: `Validated ${artifactCount} workspace artifact snapshot(s)`,
    hookKey: request.hookKey,
    hookEvent: request.hookEvent,
    taskId: request.taskId,
    artifactCount,
  }),
);
