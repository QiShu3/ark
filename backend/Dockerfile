FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 从官方镜像复制 uv 可执行文件
COPY --from=ghcr.io/astral-sh/uv:0.7.3 /uv /uvx /bin/

# 复制依赖文件
COPY pyproject.toml uv.lock ./

# 使用 uv 同步依赖
RUN uv sync --frozen --no-dev

# 复制应用代码
COPY . .

ENV PATH="/app/.venv/bin:${PATH}"

EXPOSE 8000

# 运行应用
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
