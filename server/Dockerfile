# syntax=docker/dockerfile:1.7
#
# Blockheads Preserved server image.
#   docker build -t blockheads-preserved-server .
#   docker run --rm -p 15151:15151/udp -v bh-data:/data blockheads-preserved-server
#
# The protocol server is Blockheads Server (GPL-3.0-or-later), pinned to a release tag.

FROM rust:1-bookworm AS build
ARG BH_SERVER_REPO=https://github.com/Blockheads-Club/blockheads-server.git
ARG BH_SERVER_REF=v0.5.1
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 --branch "${BH_SERVER_REF}" "${BH_SERVER_REPO}" . \
 && cargo build --release --locked -p blockheads_server --bin blockheads_server \
 && strip target/release/blockheads_server

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 65532 --home-dir /data --shell /usr/sbin/nologin blockheads \
 && mkdir -p /data \
 && chown blockheads:blockheads /data

COPY --from=build /src/target/release/blockheads_server /usr/local/bin/blockheads_server
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh

ENV BLOCKHEADS_DATA_DIR=/data \
    BH_WORLD=PRESERVED \
    BH_PORT=15151 \
    BH_PRIVACY=public

VOLUME ["/data"]
EXPOSE 15151/udp
USER 65532
WORKDIR /data

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
