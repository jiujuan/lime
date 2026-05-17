FROM node:20-bookworm-slim

WORKDIR /workspace
RUN useradd -m -s /bin/bash agent \
  && mkdir -p /logs/agent /logs/artifacts /logs/verifier \
  && chmod -R 777 /logs /workspace

# The benchmark task is intentionally dependency-light. The agent under test may
# mount or clone the Lime workspace according to the runner configuration.
