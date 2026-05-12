# SIMI ERP - Arquitectura Multi Cloud

Proyecto PoC para la cadena de farmacias SIMI.

## Descripcion

Este proyecto implementa un sistema ERP basico para registrar y consultar productos farmaceuticos utilizando una arquitectura basada en microservicios dockerizados.

## Tecnologias utilizadas

- Node.js
- Express
- PostgreSQL
- Docker
- Docker Compose
- AWS EC2
- GitHub Actions

## Servicios principales

- Frontend ERP: Node.js + Express
- Base de datos: PostgreSQL
- API REST: /api/productos

## Estructura del proyecto

frontend/              Servicio web ERP con Node.js y Express
database/              Servicio PostgreSQL con script init.sql
docker-compose.yml     Orquestacion local de servicios
docker-compose.web.yml Despliegue del frontend en EC2 ERP
docker-compose.db.yml  Despliegue de PostgreSQL en EC2 BD
.github/workflows/     Automatizacion CI/CD

## Despliegue local

docker compose up -d --build

## Acceso

Frontend: http://IP_PUBLICA_WEB/index.html
API: http://IP_PUBLICA_WEB/api/productos

## Autor

Sebastian Epulef
