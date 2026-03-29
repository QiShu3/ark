FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 安装系统依赖和 curl
RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

# 安装 uv（正确的安装方式）
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

# 将 uv 添加到 PATH
ENV PATH="/root/.local/bin:${PATH}"

# 复制依赖文件
COPY pyproject.toml uv.lock ./

# 使用 uv 同步依赖
RUN uv sync --frozen --no-dev

# 复制应用代码
COPY . .

EXPOSE 8000

# 运行应用
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]