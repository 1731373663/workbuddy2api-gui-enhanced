# WorkBuddy2API GUI 部署与升级

本文档说明如何将本管理页面与 `workbuddy2api-global-fix` 网关一起部署，以及升级时如何避免账号、配置和统计数据丢失。

## 1. 组件关系

网关仓库：

```text
https://github.com/1731373663/workbuddy2api-global-fix
```

管理页面（本仓库）：

```text
https://github.com/1731373663/workbuddy2api-gui-enhanced
```

推荐目录结构：

```text
workbuddy-stack/
├── workbuddy2api/
└── workbuddy2api-gui/
```

网关默认端口 `7863`，管理页面默认端口 `8787`。面板通过 HTTP 调用网关，同时直接挂载网关的 `auths/` 和 `config.json`。

## 2. 环境要求

- Docker Desktop 或 Docker Engine API 24+
- Docker Compose v2
- 已部署并可正常请求的网关
- 浏览器可访问管理页面端口

## 3. 全新部署

### 3.1 获取源码

```bash
git clone https://github.com/1731373663/workbuddy2api-gui-enhanced.git workbuddy2api-gui
cd workbuddy2api-gui
```

### 3.2 修改 Compose

打开 `docker-compose.yml`，至少检查以下内容：

```yaml
WBGUI_GATEWAY_URL: "http://host.docker.internal:7863"

volumes:
  - ../workbuddy2api/auths:/app/auths
  - ../workbuddy2api/config.json:/gateway/config.json
```

如果两个项目不在同一父目录，把 `../workbuddy2api/...` 改成网关实际绝对路径。不要把面板的 `config.json` 和网关的 `config.json` 挂到同一个容器路径，它们字段不同。

### 3.3 修改面板口令

修改 `docker-compose.yml` 中的：

```yaml
WBGUI_USERNAME: "admin"
WBGUI_PASSWORD: "请换成强口令"
```

也可以保留环境变量，部署后立即从系统页修改口令。默认口令只适合本机首次启动。

### 3.4 构建并启动

```bash
docker compose up -d --build
docker compose ps
```

访问：

```text
http://127.0.0.1:8787
```

页面登录成功且仪表盘能读到网关账号，才算部署完成。

## 4. 配置方式

面板可以使用环境变量或在 `config.json` 中配置。容器部署更推荐使用 `WBGUI_*` 环境变量，避免敏感配置散落在多个文件。

常用字段：

| 字段 | 说明 |
|---|---|
| `WBGUI_GATEWAY_URL` | 网关地址。容器内不能写 `127.0.0.1` 来表示宿主机 |
| `WBGUI_GATEWAY_API_KEY` | 网关 API 密钥；留空时会尝试从挂载的网关配置读取 |
| `WBGUI_AUTH_DIR` | 网关 `auths/` 在面板容器内的路径 |
| `WBGUI_CONFIG_FILE` | 网关 `config.json` 在面板容器内的路径 |
| `WBGUI_AUTH_OWNER_UID` | 面板写凭证后的属主，默认网关容器的 `10001` |
| `WBGUI_BACKUP_DIR` | 面板配置备份目录，必须挂载到持久化路径 |
| `WBGUI_CREDENTIALS_FILE` | 面板登录凭据文件；不设置时网页改密码功能不可用 |
| `WBGUI_CONTAINER` | 网关容器名，默认 `workbuddy2api` |
| `WBGUI_DANGEROUS_OPS` | 是否允许删除账号、重启网关、恢复备份 |
| `WBGUI_READ_ONLY` | 只读监控模式 |

## 5. 数据与安全

面板可以直接读取账号 `accessToken` 和 `refreshToken`，权限等同于账号完全控制权。

必须保护：

- `data/`：面板凭据、备份和运行状态；
- 网关的 `auths/`；
- 网关的 `config.json`；
- 网关的 `data/metrics.json` 和 `data/state.json`。

建议：

- 默认保持 `WBGUI_DANGEROUS_OPS=false`；
- 公网部署时使用 HTTPS、强口令和防火墙；
- 不把 `/var/run/docker.sock` 暴露给不信任容器；不需要一键重启时直接注释该挂载；
- 不将 `data/`、真实账号令牌和真实配置文件提交到 Git。

## 6. 升级

升级前先备份两个仓库的运行时数据：

```bash
docker compose stop
cp -a data data.backup-$(date +%Y%m%d)
```

同时备份网关的 `auths/`、`config.json`、`data/state.json` 和 `data/metrics.json`。

升级面板：

```bash
git fetch origin
git pull --ff-only
docker compose up -d --build
docker compose ps
docker compose logs --tail=200 wbgui
```

升级后检查：

1. 面板能登录；
2. 仪表盘能看到账号；
3. 请求统计仍有历史数据；
4. 面板能访问网关的 `/status`、`/v1/models` 和 `/v1/stats`。

## 7. 网络与代理

面板容器中的 `127.0.0.1` 指向面板自己，不指向宿主机。需要访问宿主机网关时使用：

```text
http://host.docker.internal:7863
```

如果 Docker 配了代理，容器内也不要沿用宿主机的：

```text
http://127.0.0.1:7897
```

确需通过宿主机代理时使用 `host.docker.internal:7897`，并将 `localhost`、`127.0.0.1`、`::1`、`host.docker.internal` 加入 `NO_PROXY`。

## 8. 常见问题

### 仪表盘显示网关连接失败

检查 `WBGUI_GATEWAY_URL`，在容器内执行：

```bash
docker compose exec wbgui wget -qO- http://host.docker.internal:7863/healthz
```

### 账号已经添加，但网关显示未加载

检查 `WBGUI_AUTH_DIR` 是否指向网关真实的 `auths/`，以及 `WBGUI_AUTH_OWNER_UID` 是否与网关容器的运行用户一致。默认网关镜像使用 `10001`。

### 修改配置后无法恢复

确认 `WBGUI_BACKUP_DIR` 挂载到宿主机持久化目录。单文件挂载时，容器可写层在重建后会丢失。

### 页面提示正常，但国际版请求失败

`/status` 的 healthy 字段只说明账号状态机没有冷却或禁用，不是实时上游探测。请查看网关日志、`/v1/stats` 和真实请求结果，再结合代理和网络排查。

### 构建时提示 `127.0.0.1:7897 connection refused`

这是 Docker 构建阶段继承了宿主机代理地址，而不是面板配置错误。容器里的 `127.0.0.1` 不是宿主机。Docker Desktop 应使用自身的网络和代理设置，不要把 `HTTP_PROXY=http://127.0.0.1:7897` 注给 build。排查时可在 PowerShell 当前会话清空：

```powershell
$env:HTTP_PROXY=''
$env:HTTPS_PROXY=''
$env:http_proxy=''
$env:https_proxy=''
docker compose build --no-cache
```

如果构建机确实需要代理，请使用该机器可访问的代理地址，并为 Docker Desktop 正确配置代理白名单，不要把浏览器本机代理地址硬编码进仓库。

## 9. 发布检查

提交前确认：

- `git status` 中没有 `data/`、真实 `config.json`、令牌或备份；
- `docker-compose.yml` 中的端口、网关地址和挂载路径适合目标部署环境；
- `docker compose config` 能通过；
- `docker compose up -d --build` 能启动面板；
- README 或本文件中的部署步骤与实际 Compose 一致。
