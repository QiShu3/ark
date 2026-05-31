# Ark 部署到服务端

## 环境

- **服务端**: x86 Linux，已安装 Docker + Docker Compose
- **代码**: git clone 到服务器

---

## 首次部署

```bash
# 1. 克隆项目代码
git clone <你的仓库地址> /home/ark/ark
cd /home/ark/ark

# 2. 准备词汇数据
# 方式 A：从本地 scp 过去
#   本地执行：scp -r /Users/qishu/Project/english-vocabulary/json_original/json-sentence 服务器:/home/ark/ark/vocab-data
#
# 方式 B：如果词汇数据也在 git 仓库里
#   git clone <词汇数据仓库> /home/ark/english-vocabulary
#   ln -s /home/ark/english-vocabulary/json_original/json-sentence ./vocab-data

# 3. 创建后端环境变量
touch backend/.env

# 4. 构建镜像并启动
docker compose build --no-cache
docker compose up -d

# 5. 查看启动日志
docker compose logs -f
```

---

## 日常管理

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs -f

# 重启服务（更新代码后）
git pull
docker compose build --no-cache
docker compose up -d

# 单独重启后端（不改前端代码时更快）
docker compose build backend
docker compose up -d backend

# 停止
docker compose down

# 停止并删除数据库数据
docker compose down -v
```

---

## 更新词汇题库

```bash
# 在 vocab-data 目录替换或新增 JSON 文件后：
docker compose restart backend
# entrypoint 会自动检测并导入新词书
```

---

## 环境变量

在 `backend/.env` 中配置（至少需要填 API Key）：

```env
CHAT_API_KEY=你的API密钥
CHAT_BASE_URL=https://api.deepseek.com
CHAT_MODEL=deepseek-chat
AUTH_TOKEN_TTL_SECONDS=86400
MCP_SERVERS=
```

---

## 端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| 前端 (nginx) | 80 | 浏览器访问 |
| 后端 (uvicorn) | 8000 | 内部通信 |
| PostgreSQL | 5432 | 内部通信 |

---

## 备份数据库

```bash
# 导出
docker exec ark-db-1 pg_dump -U postgres ark > backup.sql

# 导入
cat backup.sql | docker exec -i ark-db-1 psql -U postgres ark
```
