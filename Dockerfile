# WorkBuddy2API Web GUI - multi-stage build: the frontend bundle in
# internal/webui/dist is embedded into the Go binary.
#
# Build: docker compose build   (or: docker build -t wbgui .)
# The built frontend bundle is committed to the repo, so a fresh clone builds
# and runs without any manual npm step. To rebuild the bundle after editing
# web/src: cd web && npm install && npm run build
#
# docker-cli is bundled so the System page can restart the gateway container;
# drop it and the docker.sock mount if that ability is not needed.

FROM golang:1.23-alpine AS build
ARG VERSION=dev
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath \
      -ldflags="-s -w -X main.version=${VERSION}" \
      -o /out/wbgui ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata wget docker-cli \
 && adduser -D -u 10001 app \
 && mkdir -p /app
WORKDIR /app
COPY --from=build /out/wbgui /app/wbgui
USER app
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8787/api/session >/dev/null || exit 1
ENTRYPOINT ["/app/wbgui"]
CMD ["-config", "/app/config.json"]
