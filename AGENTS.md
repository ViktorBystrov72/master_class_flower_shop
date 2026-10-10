# Агенты

Набор для создания сайта на любую тему. Тему, название и действия посетителя берёшь из сообщения человека. Если темы нет, один раз спроси, о чём сайт. Направление дизайна человек выбирает сам: сначала предложи несколько западных сайтов той же тематики и дождись выбора или своей ссылки. Остальное решай сам.

Код сайта создавай в подпапке `site/`. Корень набора — спецификации, навыки и эта инструкция — не публиковать.

Перед любой публикацией, диагностикой или настройкой Layero прочитай [`.agents/skills/layero/SKILL.md`](.agents/skills/layero/SKILL.md). Это источник правды. События CLI — [`references/json-events.md`](.agents/skills/layero/references/json-events.md), поля `layero.json` — [`references/layero-json.md`](.agents/skills/layero/references/layero-json.md). Документация: https://docs.layero.ru/agents/ и https://layero.ru/llms.txt.

Если на сайте есть вход, оплата, розыгрыш или форма «поддержки», до публикации прочитай [`.agents/skills/layero-content-rules/SKILL.md`](.agents/skills/layero-content-rules/SKILL.md).

Чтобы запустить сайт на компьютере человека, прочитай [`.agents/skills/local-site/SKILL.md`](.agents/skills/local-site/SKILL.md). Там определение Windows, macOS и Linux, установка Node.js и команда `npm run dev`. Адрес из вывода сервера вставь в чат ссылкой. Для локальной проверки на Layero не публикуй.

## Куда деплоить

Команды запускай из `site/`.

Node.js и пакеты сайта ставь так же, как в навыке локального запуска: сначала определи Windows, macOS или Linux. CLI Layero не ставь глобально: `npx layero@latest` скачивает его сам.

Если в `site/` ещё нет `.layero/project.json`, первый `deploy` создаёт новый проект Layero под этот сайт.

Если файл уже есть, повторный `deploy` обновляет тот же проект и **заменяет живой сайт**. Без явной просьбы человека повторно не публикуй.

```bash
cd site
npm install
npx layero@latest deploy --dry-run --json
npx layero@latest deploy --json
```

`--dry-run` ничего не заливает и логин не нужен. Если `confident` равен `false`, сначала выполни `hint` и `next_action`.

Адрес сайта бери только из события `ready.url` и вставь его в ответ в чат кликабельной ссылкой. Не собирай адрес по шаблону и не подставляй чужой проект. `dashboard_url` — панель, не сайт; одной панелью или словом «готово» ответ не заканчивай.

## Три пути

1. **Подключён репозиторий** (GitHub, GitVerse, GitLab, GitFlic, SourceCraft) — push в ветку даёт превью, push в `main` публикует прод. Подключение: `npx layero@latest projects create --repo <provider>:<owner/repo>`.
2. **Есть папка с кодом, репозиторий не нужен** — `npx layero@latest deploy --json` из `site/`. CLI упаковывает папку, платформа собирает сама.
3. **Сайт уже на Layero** — `npx layero@latest diagnose`, `logs`, `rollback`, `domains`, `env`, `envs list` или MCP `https://mcp.layero.ru/mcp`.

## Вход

Без токена CLI печатает `{"event":"auth_required","url":"…","user_code":"…"}`. Покажи `url` ссылкой и жди: CLI опрашивает вход сам. В CI: `LAYERO_TOKEN=… npx layero@latest deploy --project <slug> --json --yes`. Slug бери из `.layero/project.json` этого сайта, не из другого проекта.

`--claim` — только если человек явно попросил публикацию без аккаунта. Для серверного приложения платформа ответит `claim_static_only`.

## Правила

- Повторный `deploy` из `site/` обновляет тот же проект. Коммит для этого не нужен.
- Обычный `deploy` проекта, который уже опубликован, **заменяет живой сайт**. Не публикуй без явной просьбы человека.
- `--branch` CLI отклоняет (`branch_unsupported`). Отдельное превью бывает только у push в ветку подключённого репозитория.
- Не делай `git init` ради деплоя. Не ставь CLI глобально: только `npx layero@latest`.
- В `--json` смотри поле `event`. При `error` выполни `next_action`. Коды выхода: 0 — готово, 2 — нужен вход, 3 — проект не найден, 4 — неверные аргументы, 5 — ошибка платформы.
- Две одинаковые ошибки сборки подряд — остановись и скажи человеку. Третий деплой с той же ошибкой не запускай.
- `layero.json` не создавай заранее. Одно поле — на один конкретный симптом, и только после чтения `references/layero-json.md`.
- `rollback`, выдача ключей Data API и смена того, что видят посетители, — только после согласия человека.
