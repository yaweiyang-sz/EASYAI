FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# 先复制依赖文件并安装
COPY requirements.txt .

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码（明确列出，避免权限问题）
COPY main.py .
COPY models.py .
COPY api ./api
COPY services ./services

# 创建必要的目录
RUN mkdir -p __pycache__ api/__pycache__ services/__pycache__

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
