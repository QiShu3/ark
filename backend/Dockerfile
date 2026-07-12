FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV UV_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple

# Keep the production build independent from a separate GHCR build-stage image.
RUN pip install --no-cache-dir --index-url https://mirrors.cloud.tencent.com/pypi/simple uv==0.7.3

# 复制依赖文件
COPY pyproject.toml uv.lock ./

# Export the locked production dependency set, then install it from the
# configured mirror instead of downloading package artifacts from uv.lock URLs.
RUN uv export --frozen --no-dev --no-emit-project -o requirements.txt \
    && pip install --no-cache-dir --index-url https://mirrors.cloud.tencent.com/pypi/simple -r requirements.txt

# 复制应用代码
COPY . .

ENV PATH="/app/.venv/bin:${PATH}"

EXPOSE 8000

# 运行应用
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
