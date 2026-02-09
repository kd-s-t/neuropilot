#!/usr/bin/env bash
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql
sudo -u postgres psql -c "CREATE USER ${db_name} WITH PASSWORD '${db_password_escaped}';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE ${db_name} OWNER ${db_name};" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${db_name} TO ${db_name};"
