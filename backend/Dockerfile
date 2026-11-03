# Back-end do Digital Twin Industrial. Construir a partir da RAIZ do repositório:
#   docker build -f backend/Dockerfile -t digital-twin-api .
FROM python:3.12-slim

WORKDIR /srv
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# o esquema das tabelas e os dados iniciais vêm da pasta do banco de dados
COPY banco-de-dados/scripts/modelo.py banco-de-dados/scripts/modelo.py
COPY banco-de-dados/sql banco-de-dados/sql
COPY backend/app backend/app

WORKDIR /srv/backend
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
