#!/bin/sh
set -e

# 如果挂载了词汇数据目录，自动导入到数据库
if [ -n "$VOCAB_DATA_DIR" ] && [ -d "$VOCAB_DATA_DIR" ]; then
  count=$(ls "$VOCAB_DATA_DIR"/*.json 2>/dev/null | wc -l)
  if [ "$count" -gt 0 ]; then
    echo "[entrypoint] 检测到 $count 个词书文件，检查是否需导入..."
    python3 -c "
import asyncio, asyncpg, sys
sys.path.insert(0, '/app')
from routes.auth_routes import _database_url
async def check():
    pool = await asyncpg.create_pool(dsn=_database_url(), min_size=1)
    try:
        async with pool.acquire() as conn:
            n = await conn.fetchval('SELECT COUNT(*) FROM vocab_decks')
    except Exception:
        sys.exit(42)  # 表不存在，需导入
    await pool.close()
    sys.exit(0 if n and n > 0 else 42)
asyncio.run(check())
" && rc=0 || rc=$?
    if [ "$rc" -eq 42 ]; then
      echo "[entrypoint] 数据库为空，开始导入词书..."
      python3 /app/scripts/import_vocab.py --source-dir "$VOCAB_DATA_DIR" || echo "[entrypoint] 部分词书导入失败，继续启动服务"
      echo "[entrypoint] 词书导入完成"
    else
      echo "[entrypoint] 词书已存在，跳过导入"
    fi
  fi
fi

exec uvicorn main:app --host 0.0.0.0 --port 8000
