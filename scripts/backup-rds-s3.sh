#!/bin/bash

set -e

cd /simi/simi-erp

set -a
source .env
set +a

FECHA=$(date +"%Y-%m-%d_%H-%M-%S")
ARCHIVO="backup_simi_erp_${FECHA}.sql"
RUTA_LOCAL="/simi/simi-erp/backups/${ARCHIVO}"
RUTA_S3="s3://${S3_BUCKET}/rds-postgresql/${ARCHIVO}"

echo "Iniciando backup de RDS PostgreSQL..."
echo "Base de datos: ${DB_NAME}"
echo "Archivo local: ${RUTA_LOCAL}"

docker run --rm \
  -e PGPASSWORD="${DB_PASSWORD}" \
  -v /simi/simi-erp/backups:/backups \
  postgres:16-alpine \
  pg_dump "host=${DB_HOST} port=${DB_PORT} user=${DB_USER} dbname=${DB_NAME} sslmode=require" \
  -f "/backups/${ARCHIVO}"

echo "Backup generado correctamente."

echo "Subiendo backup a S3..."
aws s3 cp "${RUTA_LOCAL}" "${RUTA_S3}"

echo "Backup subido correctamente a:"
echo "${RUTA_S3}"
