# Настройка SSH для GitHub

Remote уже переключён на SSH: `git@github.com:innodam/kitchen-tg-app.git`

## Шаги (выполните в терминале)

### 1. Создать ключ
```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "innodam@github" -f ~/.ssh/id_ed25519_github -N ""
```
(Опционально) Чтобы GitHub всегда использовал этот ключ, добавьте в `~/.ssh/config`:
```
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_github
```

### 2. Показать публичный ключ (скопируйте всю строку)
```bash
cat ~/.ssh/id_ed25519_github.pub
```

### 3. Добавить ключ в GitHub
- Откройте: https://github.com/settings/ssh/new
- **Title:** например `MacBook`
- **Key:** вставьте скопированную строку из шага 2
- **Add SSH key**

### 4. Проверить
```bash
ssh -T git@github.com
```
Должно появиться: `Hi innodam! You've successfully authenticated...`

### 5. Пушить без пароля
```bash
cd /Users/dambas/Projects/kitchen-tg-app
git push -u origin main
```
