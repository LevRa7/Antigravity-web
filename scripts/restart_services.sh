#!/usr/bin/env bash
set -e

echo "🔄 Перезапуск служб Antigravity Web..."
systemctl --user restart antigravity-auth-server.service || true

echo " Stopping old language_server processes..."
systemctl --user stop antigravity-server.service || true
pkill -9 -f language_server || true
sleep 1

systemctl --user start antigravity-server.service
sudo openresty -t && sudo openresty -s reload

echo "✅ Все службы успешно перезапущены!"
