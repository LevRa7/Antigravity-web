#!/usr/bin/env bash
set -e

echo "🚀 Установка и настройка Antigravity Web..."

# 1. Nginx deployment
sudo cp config/nginx.conf /etc/nginx/sites-available/antigravity
sudo ln -sf /etc/nginx/sites-available/antigravity /etc/nginx/sites-enabled/
sudo cp web/login.html /usr/local/openresty/nginx/html/login.html
sudo cp web/polyfill.js /usr/local/openresty/nginx/html/polyfill.js

# 2. Systemd deployment
mkdir -p ~/.config/systemd/user/
cp config/systemd/*.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable antigravity-auth-server.service
systemctl --user enable antigravity-server.service

# 3. Nginx reload
sudo openresty -t
sudo openresty -s reload

echo "✅ Установка успешно завершена!"
