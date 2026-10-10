# JSON-события CLI Layero

Полный справочник: <https://docs.layero.ru/cli/json-events> (en:
<https://docs.layero.ru/en/cli/json-events>). Здесь — то, что агенту нужно
во время деплоя.

Режим включается флагом `--json`, переменной `LAYERO_JSON=1` и сам — внутри
агента или когда stdout не TTY. В этом режиме CLI не задаёт вопросов
(`--prod` всё равно требует `--yes`), печатает одну строку
`{"event": "...", "ts": "<ISO-8601>", ...}` на действие, а ошибки приходят
со стабильными `code` и `next_action`.

## События деплоя

| событие | поля | что делать |
|---|---|---|
| `auth_required` | `url`, `user_code` | Покажи `url` кликабельной ссылкой. CLI опрашивает каждые 2 с, токен кэшируется в `~/.layero/config.json`. Локального callback нет — браузер может быть на другой машине. Истечение — `error{auth_expired \| auth_timeout}`. |
| `authorized` | `user` | Вход прошёл. |
| `project_created` | `project_id`, `slug`, `organization` | Первый деплой в папке — проект создан. |
| `project_linked` | `project_id`, `slug` | Деплой в проект из `.layero/project.json`. |
| `detected` | `framework`, `build_cmd` (null = сборки нет), `output_dir` (null = станет известно после сборки), `confident`, `sources`, `hint`, `next_action`, `candidates`, `runtime_kind`, `layero_warnings` | Как CLI видит папку — совет, в проект не сохраняется. `confident: false` — папка не распознана: `hint` называет форму (приложение в подпапке, фронт + бэкенд, свой скрипт сборки, сервер), `next_action` — исправление, сделай его до деплоя. Значения из `layero.json` здесь уже применены. `layero_warnings` — ключи `layero.json`, которые платформа не применит, с правильным именем (`"type"` → `"framework"` или `"runtime"`). |
| `plan` | как у `detected`, плюс `root`, `project`, `project_settings`, `creates_project`, `replaces_live_site` | Только `deploy --dry-run`: план сборки в порядке сборщика (`layero.json` > настройки проекта > детект). Ничего не загружается и не создаётся, вход не нужен. |
| `packing` | `files`, `bytes`, `sha256` | Папка упакована в tar.gz. |
| `uploading` / `uploaded` | `archive_key` | Загрузка архива. |
| `prebuilt` | `dir` | Деплой готовой сборки (`--prebuilt <каталог>`); сборка на платформе пропускается. |
| `runtime_type_applied` | `project_type` | Проект запускается как контейнер (`ssr_next`, `node_web`, `python_web`, `streamlit`, `gradio`, `flask`) — задано при создании или флагом `--type`. |
| `runtime_type_apply_failed` | `error` | Тип не установлен; деплой идёт с прежним. |
| `setup_applied` | — | Настройки проекта приняты. Записывается только то, что названо явно (`--type`, свой `.layero/project.json`); остальное сборщик решает по архиву на каждой сборке. |
| `repeated_failure_guard` | `streak`, `threshold`, `scope`, `failure_stage`, `error` | Подряд идущие сборки падают с той же ошибкой — платформа остановилась. Прочитай `error`, убери причину. Автоматически продолжить нельзя. |
| `deploy_started` | `deploy_id` | Бэкенд принял задачу. |
| `stage` | `name`: `clone`/`install`/`build`/`upload`/`activate`/… | Стадия сборки; приходит до первой строки лога этой стадии. |
| `queued` | `waited_s` | Сборка ждёт сборщика; печатается каждые 15 с до первого `stage`. Это не сбой — продолжай ждать. |
| `build_log` | `line`, `stream` | Сырой лог. В чат пересылай только строки с ошибками. Строки `npm http fetch/cache` скрыты (вместо них одна строка-маркер). |
| `ready` | `url`, `dashboard_url`, `deploy_id`, `edge_ready`, `screen` | **Финал.** `url` — живой публичный адрес, он уже отвечает: CLI ждёт (до 90 с), пока адрес отдаёт сайт, а не страницу платформы. Вставь `url` в ответ в чат как есть и остановись. `dashboard_url` — панель, не сайт. `edge_ready: false` (вместе с `screen`) — приложение не поднялось: `npx layero@latest logs --runtime`. `preview_url` и `edge_eta_seconds` устарели. |
| `claimable` | `project_id`, `slug`, `url`, `claim_url`, `expires_at` | Деплой без аккаунта (`--claim`): временный сайт на 1 час — только статика и SPA, случайный адрес, закрыт от поисковиков. Приходит **до** `ready`, на каждом деплое этой папки. Отдай человеку `claim_url` — забрать сайт может только он, в панели. `diagnose` / `logs` в этой папке работают без аккаунта. |
| `promoted` | `url`, `deploy_id` | Апекс переключён на деплой (`layero promote`, `deploy --promote`). В чат верни `url`. |
| `error` | `code`, `next_action`, `message` | Выполни `next_action`. |

## События остальных команд

| событие | команда | поля |
|---|---|---|
| `me` | `whoami` | `id`, `username`, `email`, `github_login` |
| `projects` | `projects list` | `projects[]`: `id`, `slug`, `name`, `organization`, `url`, `source_type`, `repo`, `status` |
| `organizations` | `orgs list` | `organizations[]`: `id`, `slug`, `kind`, `role` |
| `project_created` | `projects create --repo` | как у деплоя, плюс `url`, `repo`, `branch` |
| `source_connected` | `sources connect`, `projects create` | `org`, `connection_id`, `provider`, `account` |
| `webhook_installed` / `webhook_unavailable` | `projects create` | `project`, `url` (у GitHub App нет поля `url`: вебхук — часть установки); у `webhook_unavailable` ещё есть `hint`. Без вебхука push не собирает — скажи человеку и дай `url` для ручной настройки. |
| `setup_applied` | `projects create` | `project`, `framework`, `build_cmd`, `output_dir`, `layero_found`. Команда сама закончила мастер настройки; следом идёт `deploy_started`. `framework`/`build_cmd`/`output_dir` — что увидел детект, для сведения: в проект они НЕ записываются — сборщик определяет их по репозиторию на каждой сборке (CLI 0.11.4+) |
| `deploy_started` | `projects create`, `deploy` | `deploy_id`; для `projects create` ещё `project`, `url`. Первая сборка идёт — продолжай через `deploys list --project <slug>` или MCP `site_status` |
| `setup_pending` | `projects create --no-deploy` | `project`, `url`, `hint`. Проект оставлен в мастере настройки: сборок не будет, пока человек не закончит настройку по `url` |
| `setup_failed` | `projects create` | `project`, `reason`, `url`, `hint`. Проект **создан** (выход 0), но детект, настройка или старт сборки не удались — скажи человеку закончить в панели по `url` |
| `sources` | `sources list` | `org`, `providers[]` (`id`, `title`, `self_hosted`, `webhook_supported`, `token_hint`), `connections[]` (`id`, `provider`, `account`, `status`, `projects_count`, `token_expiry_state`, `last_error`) |
| `source_repos` | `sources repos` | `org`, `connection_id`, `repos[]` (`path`, `name`, `default_branch`, `private`, `can_admin`) |
| `environments` | `envs list` | `project`, `environments[]` (`id`, `branch`, `url`, `hostname`, `active_deploy_id`, `active_deploy_at`, `production`) |
| `project_deleted` | `projects delete --yes` | `project_id`, `slug` |
| `project_linked` | `link` | `project_id`, `slug`, `url`, `status` |
| `hooks` / `hook_created` / `hook_deleted` | `hooks *` | `project`, `hooks[]` / `id`, `name`, `branch`, `target`, `url` / `id` |
| `init_done` | `init` | `framework`, `confident`, `agent_docs[]` (`file`, `result`), `project_json` — `init` настройки не записывает |
| `logged_out` | `logout` | `config_path` |
| `claim_status` | `claim status` | `code`, `status`, `claimed`, `expires_at`, `url`, `claim_url` |
| `claim_accept` | `claim accept` | `code`, `claim_url`, `opened` — в режиме агента браузер не открывается; покажи ссылку человеку |

События `data_*` (Data API: `layero data …`) описаны в полном справочнике.

## Коды `error` во время деплоя

| `code` | когда | `next_action` |
|---|---|---|
| `auth_required` | Нет токена в `~/.layero/config.json` и в `LAYERO_TOKEN` | `layero login` или задай `LAYERO_TOKEN` |
| `auth_expired` | Истёк `user_code` (15 мин) или сохранённый токен истёк (7 дней) / отозван — API ответил 401 | снова `layero login` |
| `auth_timeout` | 15 минут опроса без подтверждения | снова `layero login` |
| `plan_limit` | Лимит тарифа (API 402) | Повысь тариф на `app.layero.ru/billing` или удали лишнее |
| `username_required` | У аккаунта не выбрано имя (API 412); в режиме агента спросить некого | `layero username <имя>` |
| `username_rejected` | Имя занято или неверного вида | Строчные латинские буквы, цифры, дефис, 2–32 символа |
| `oauth_unavailable` | Провайдер входа недоступен | Позже |
| `project_unknown` | Вне каталога проекта и без `--project` | Запусти из каталога проекта или передай `--project <id\|slug>` |
| `project_not_found` | `--project` указывает на несуществующий проект | `layero projects list` |
| `cli_deploys_disabled` | Деплои из CLI выключены в проекте | Настройки проекта → деплои CLI |
| `invalid_type` | Неизвестный `--type` | Убери флаг или возьми допустимый пресет |
| `invalid_choice` | Неверный выбор без TTY | Явный флаг |
| `branch_unsupported` | `deploy --branch`: архив всегда идёт в окружение `cli`, флаг превью не даёт. Ничего не загружено | Подключи репозиторий (`projects create --repo`) и запушь в ветку; у проекта с репозиторием `next_action` говорит, куда пушить |
| `repo_format` / `account_not_found` / `repo_not_found` / `repo_already_imported` / `source_connect_failed` | `projects create --repo`: формат, нет подключения к провайдеру, репозиторий не виден, уже привязан, привязка не удалась | `next_action`: `sources list`, `sources connect`, `sources repos`, `link` |
| `provider_unknown` / `token_missing` / `source_rejected` / `connection_not_found` | `sources connect` / `sources repos` | Список провайдеров, `--token-stdin`, `token_hint` провайдера, `sources list` |
| `hook_not_found` | `hooks delete` с чужим id | `hooks list` |
| `claimable_unavailable` | Деплой без аккаунта на платформе не включён | `layero login` или `LAYERO_TOKEN` |
| `sandbox_claimed` | Ещё один `deploy` в папке песочницы, но человек уже забрал сайт в аккаунт; токен песочницы отозван | Попроси человека войти этим аккаунтом (`npx layero@latest login`), затем тот же `deploy` |
| `sandbox_expired` | Ещё один `deploy` в папке песочницы, но час вышел и песочница удалена; мёртвая ссылка убрана | Новая песочница — `deploy --claim` (с согласия человека); чтобы сохранить сайт — войди |
| `claim_static_only` | `deploy --claim` (или автоматический режим без входа) в папке серверного приложения — SSR, fullstack, контейнер. Без аккаунта уходят только статика и SPA; ничего не создано и не загружено | Попроси человека войти (`npx layero@latest login`), затем тот же `deploy` без `--claim` |
| `claim_with_project` | `deploy --claim --project <проект>`: песочница создаёт новый проект и не деплоит в существующий | Существующий проект — `layero login` и без `--claim`; новый сайт — `--claim` без `--project` |
| `claim_unknown` | Нет claim для проекта папки (хранится в `~/.layero/config.json`), либо код неверный или истёк | Передай код; новый — `deploy --claim` |
| `prebuilt_no_dir` / `prebuilt_no_index` | Папка `--prebuilt` не найдена / в ней нет `index.html` | `--prebuilt ./dist` с собранным `index.html` |
| `deploy_not_started` | Сборка не стартовала | Повтори; если повторяется — `npx layero@latest diagnose` |
| `deploy_watch_lost` | CLI потерял лог сборки (сетевые сбои подряд); сборка на платформе продолжается | НЕ деплой снова: `npx layero@latest deploys list --json`, затем `logs --deploy <id>` |
| `deploy_failed` | Сборка не дошла до `ready` | `npx layero@latest diagnose --deploy <id>` (в `next_action`; работает и без аккаунта) |
| `deploy_cancelled` | Сборка отменена | — |
| `rollback_noop` | `layero rollback`: цель отката уже на живом адресе, ничего не изменилось | Конкретный — `layero promote <sha>`; список — `layero deploys list` |
| `repeated_failure` | Та же ошибка повторяется; платформа отказалась деплоить вслепую | Убери причину; если уже убрана — `--confirm-repeated-failure` |
| `forbidden` | У CI-токена (`layero_ci_*`) нет нужной области | Выпусти токен с нужной областью |
| `org_unknown` | Несколько организаций, и команда не знает, какую взять | `--org <slug>`; список — `layero orgs list` |
| `confirmation_required` | Команда меняет доступ, а в режиме агента подтвердить некому; ничего не изменилось | Покажи план человеку и повтори с `--yes` |
| `internal` | Неожиданная ошибка CLI | Запусти снова с `--debug` |

Код неуспешного деплоя строится как `deploy_<status>`, статусов четыре:
`ready`, `building`, `failed`, `cancelled`. На практике встречаются только
`deploy_failed` и `deploy_cancelled`; кодов `deploy_error` и
`deploy_timed_out` не существует — на них не опирайся.

## Коды выхода

| код | класс | примеры |
|---|---|---|
| 0 | успех | |
| 1 | прочее | `plan_limit`, `forbidden`, `confirmation_required`, `repeated_failure` |
| 2 | нужен вход | `auth_required`, `auth_expired`, `auth_timeout`, `sandbox_claimed` |
| 3 | не найдено | `sandbox_expired`, `project_unknown`, `project_not_found`, `org_unknown`, `hook_not_found`, `claim_unknown` |
| 4 | неверный ввод | `invalid_type`, `prebuilt_no_dir`, `prebuilt_no_index`, `branch_unsupported`, `claim_with_project`, `claim_static_only`, `repo_format`, `token_missing`, `rollback_noop` |
| 5 | ошибка платформы | `deploy_failed`, `deploy_cancelled`, `deploy_not_started`, `deploy_watch_lost`, `internal`, `http_5xx` |

## Минимальный порядок действий

```text
Если человек просит задеплоить на Layero:
  1. Запусти: npx layero@latest deploy --dry-run --json
     Если detected.confident равен false — сначала сделай то, что в next_action.
  2. Запусти: npx layero@latest deploy --json
  3. Каждую строку stdout разбери как JSON, смотри поле event:
     - auth_required → покажи url кликабельной ссылкой и продолжай ждать
     - ready → в ответ в чат вставь url живого сайта; он уже отвечает
               (edge_ready true). Затем остановись.
     - error → выполни next_action дословно
  4. Не запускай git init. Не запускай npm install -g layero.
```
