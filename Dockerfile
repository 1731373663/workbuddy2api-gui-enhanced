# WorkBuddy2API Web GUI —— 多阶段构建：前端产物 embed 进 Go 二进制，运行镜像只含一个可执行文件。
#
# 构建：docker compose build   （或 docker build -t wbgui .）
# 说明：镜像内嵌 docker-cli 以便「系统」页重启网关容器；不需要该能力可移除并删掉 docker.sock 挂载。

# Frontend production assets are built on the host and embedded from internal/webui/dist.# ── 阶段 2：编译 Go 后端（含前端产物 embed）────────────────────
FROM golang:1.23-alpine AS build
ARG VERSION=dev
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath \
      -ldflags="-s -w -X main.version=${VERSION}" \
      -o /out/wbgui ./cmd/server

# ── 阶段 3：运行镜像 ────────────────────────────────────────────
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata wget docker-cli \
 && adduser -D -u 10001 app \
 && mkdir -p /app
WORKDIR /app
COPY --from=build /out/wbgui /app/wbgui
# 默认以非 root 运行；需要重启网关容器时由 compose 覆盖 user 或调整 docker.sock 权限。
USER app
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8787/api/session >/dev/null || exit 1
ENTRYPOINT ["/app/wbgui"]
CMD ["-config", "/app/config.json"]
