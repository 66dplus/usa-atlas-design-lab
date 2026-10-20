FROM postgres:16.14-bookworm@sha256:64154d0babcb1741988719e703419af0382b19953706149f9872fbd0f438efa8
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY . /app/
USER 10001:10001
ENV PGHOST=usa-atlas-postgres PGPORT=5432 PGUSER=usa_atlas_reader PYTHONDONTWRITEBYTECODE=1
ENTRYPOINT ["python3", "/app/scripts/preview_server.py"]
