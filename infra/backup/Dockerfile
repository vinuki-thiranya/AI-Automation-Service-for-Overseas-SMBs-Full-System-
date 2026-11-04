# Backup sidecar: nightly pg_dump → Backblaze B2, nightly n8n workflow export → Git.
FROM alpine:3.24.3

ARG SUPERCRONIC_VERSION=v0.2.51
# Set automatically by BuildKit; amd64 (Hetzner CX) when building without it.
ARG TARGETARCH

RUN apk add --no-cache bash ca-certificates coreutils curl git jq openssh-client \
        postgresql17-client rclone tar tzdata \
 && curl -fsSL -o /usr/local/bin/supercronic \
        "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${TARGETARCH:-amd64}" \
 && chmod +x /usr/local/bin/supercronic

COPY lib.sh backup.sh export-workflows.sh entrypoint.sh /usr/local/bin/
COPY crontab /etc/recallo/crontab
RUN chmod +x /usr/local/bin/*.sh

WORKDIR /work
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
