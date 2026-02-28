#!/bin/bash
# Настройка SSH для GitHub (без ввода пароля при push/pull)

set -e
KEY_FILE="$HOME/.ssh/id_ed25519_github"
KEY_PUB="${KEY_FILE}.pub"

echo "=== SSH-ключ для GitHub ==="

if [ -f "$KEY_PUB" ]; then
  echo "Ключ уже есть: $KEY_PUB"
else
  echo "Создаю ключ: $KEY_FILE"
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"
  ssh-keygen -t ed25519 -C "github" -f "$KEY_FILE" -N ""
  echo "Ключ создан."
fi

echo ""
echo "--- Скопируйте эту строку и добавьте в GitHub ---"
cat "$KEY_PUB"
echo ""
echo "--- Как добавить в GitHub ---"
echo "1. Откройте: https://github.com/settings/ssh/new"
echo "2. Title: например Kitchen TG App (или любое)"
echo "3. Key: вставьте скопированную строку выше (начинается с ssh-ed25519)"
echo "4. Add SSH key"
echo ""
echo "--- Переключить репозиторий на SSH ---"
echo "Выполните в папке проекта:"
echo "  git remote set-url origin git@github.com:innodam/kitchen-tg-app.git"
echo "  git push -u origin main"
