# 部署指南

[English](DEPLOYMENT.md) · [返回 README](../README.zh-CN.md)

## 配置与运行文件

复制 [config.yaml.example](../config.yaml.example) 为 `config.yaml` 后编辑。配置只在启动时加载，修改后需要重启。运行目录与仓库不同时，使用 `--config /absolute/path/config.yaml` 指定配置文件。

管理员密码支持明文或有效的 `$2a$`、`$2b$`、`$2y$` bcrypt 哈希。明文密码仅在内存中哈希，不回写文件。JWT 有效期从登录时固定计算，活动不会续期；浏览器闲置计时使用同一时长，终端会在 JWT 到期后关闭。

支持以下标量环境变量覆盖：

```text
OPSNEXUS_SERVER_ADDRESS
OPSNEXUS_BASE_PATH
OPSNEXUS_LOG_LEVEL
OPSNEXUS_SECURITY_JWT_SECRET
OPSNEXUS_SECURITY_SESSION_TIMEOUT_MINUTES
```

管理员和资产列表由 YAML 提供。真实凭证和私钥不要提交到版本库。SSH 私钥相对路径以进程工作目录为基准，建议使用绝对路径。资产响应不包含密码、私钥路径或 MongoDB URI；HTTP 访问日志不记录查询字符串。

数据库配置要点：

| 类型 | 说明 |
| --- | --- |
| MySQL | `database` 指定默认数据库 |
| DM | `database` 指定 schema，例如 `SYSDBA` |
| Redis | `database` 为非负逻辑库编号；`user` 可指定 ACL 用户名 |
| MongoDB | 复制集、TLS、`authSource` 等使用 `uri`；也可配置 `host/port/user/password/database` |

可选 mongosh 从 `./bin/mongosh`（Windows 为 `mongosh.exe`）或 PATH 查找，使用服务进程的系统权限运行。SSH 当前不校验主机指纹。这些行为以文档约定的可信内部环境为前提。

## 构建与启动

```bash
make all
./opsnexus --config config.yaml
```

Go 构建或测试前必须生成 `web/dist`，供 `web/embed.go` 嵌入。`make all`、`make build-server` 和 `build.sh` 已保证顺序。前端已构建且没有改动时，可以只重建后端：

```bash
go build -trimpath -o opsnexus ./cmd/server
```

`./build.sh` 在 `dist/` 下生成 Linux amd64、Linux arm64 和 Windows amd64 二进制。交叉编译通过不代表目标操作系统运行验收通过。`make clean` 删除生成文件后，下次 Go 构建或测试前需重新构建前端。

## 子路径与 Nginx

前后端必须使用相同 URL 前缀：

```yaml
base_path: /devops
server_address: 127.0.0.1:9090
```

```bash
VITE_BASE_PATH=/devops/ ./build.sh
./dist/opsnexus-linux-amd64 --config config.yaml
```

`map` 放在 Nginx 的 `http` 上下文中。以下为 HTTP 示例，也可将对应 `location` 配置放入现有 TLS 站点；示例不包含证书配置。

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name your-internal-host;

    location = /devops { return 301 /devops/; }

    location ^~ /devops/ {
        proxy_pass http://127.0.0.1:9090;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_buffering off;
        proxy_read_timeout 3600s;
        client_max_body_size 128m;
    }
}
```

`proxy_pass` 不加尾部 `/`，以保留 `/devops`。转发浏览器访问的 `Host`（包含端口），供 WebSocket 同源校验。关闭代理缓冲，以便 SQL 的 POST + SSE 逐条返回结果。示例上传上限为 128 MB，按实际需求调整。根路径部署使用 `base_path: ""`、不设置 `VITE_BASE_PATH` 构建，并将代理位置改为 `location /`、移除 `/devops` 重定向。

## 操作语义

- **SQL：**界面默认遇错停止并回滚；关闭此选项会继续执行，并尝试提交成功的语句。DDL 可能隐式提交。缺少最终事务事件时，应先核对数据库状态再重试。分句器支持普通分号分隔语句，不支持客户端 `DELIMITER` 或存储过程块。
- **Redis：**String 保留原始文本。Hash 编辑合并输入字段，不清除预览范围以外的字段。TTL 为 `-1` 或 `0` 时持久化，正数设置秒级过期。控制台每次执行一条命令，不支持跨请求事务或订阅。
- **MongoDB：**原生脚本支持 `db.collection.method(...)` 加严格 JSON/Extended JSON 参数，以及 `db.getCollectionNames()`。链式调用、循环和变量使用 mongosh。查询/聚合最多返回 1000 个文档；shell 超时 10 秒，输出上限 1 MiB。
- **SFTP：**先打开同一资产的终端，建立 SSH 连接。新建文件遇到同名文件会失败；上传到已有路径会覆盖文件。目录删除仅支持空目录。
- **退出：**SIGINT/SIGTERM 最多等待 HTTP 请求完成 10 秒，随后关闭 SSH、Redis 和 MongoDB 缓存连接。重启后需重新连接终端。

完整限额见 [架构说明](ARCHITECTURE.md#数据正确性和限额)。行数或文档数限制不等同于大字段的总响应字节限制。

## 故障排查

| 现象 | 检查方式 |
| --- | --- |
| `pattern dist/*: no matching files found` | Go 构建或测试前先运行 `make build-web` |
| 白屏、worker 丢失、资源 404 | 确认 `VITE_BASE_PATH` 与 `base_path` 一致，再重新构建二进制 |
| SFTP 提示未连接 | 打开同一资产的终端；SSH 失效后重新连接 |
| Mongo 原生脚本被拒绝 | 使用带双引号键的 JSON/Extended JSON；完整 JavaScript 改用 mongosh |
| SQL 事务结果未知 | 重试前先核对数据库；单条语句成功不代表已提交 |
| 完整 `go vet ./...` 报 DM 告警 | 参见 [驱动审查记录](reviews/2026-11-06.md)；`make vet` 检查应用代码 |
