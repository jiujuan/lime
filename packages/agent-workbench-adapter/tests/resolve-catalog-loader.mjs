export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@limecloud/agent-capability-catalog") {
    return {
      url: new URL("../../agent-capability-catalog/dist/index.js", import.meta.url).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
