# PRO-183: SportScore NBA API smoke-test

**Дата:** 2026-11-16, 13:02–13:06 UTC  
**Проверка:** 7 публичных анонимных GET к `/api/widget/`; API-ключ не передавался. Платные планы и аккаунты не создавались. DunkAPI не вызывался.

## Итог

SportScore **не подходит как основной бесплатный источник NBA-данных для BuzzerBoard** по результатам реальных ответов.

- NBA coverage сезона 2026/27 подтверждена: API вернул завершённые матчи 15 ноября NBA date и будущие игры до апреля 2027.
- `/matches` смешивает basketball-лиги, не имеет фильтра NBA и в выборке из 50 записей содержит лишь 3 завершённых NBA-матча за дату, для которой прежний PRO-163 smoke зафиксировал 9 завершённых игр. Endpoint нельзя считать полным NBA scoreboard.
- `/standings/` с competition slug из официального embed-примера вернул HTTP 404 `No standings data`. Rank/seed проверить не удалось.
- Match detail не содержит player box score или quarter score в проверенной игре (`stats: []`, `lineups: null`). Player endpoint вернул `stats: null`.
- Tracker endpoint вернул HTML iframe на другой хост, а не JSON live feed. Во время smoke NBA-матчей в процессе не было, поэтому latency/live clock не проверены.
- Для публичного раннего коммерческого продукта опубликованные terms разрешают бесплатное использование `/api/widget/` при видимой dofollow-атрибуции на каждом экране с данными; кэширование и объединение источников разрешены. Но происхождение отдельных NBA datasets и лицензия на лиговые/командные marks и изображения не подтверждены.

Условно рассматривать SportScore можно для ограниченного прототипа recent/team schedule с фильтрацией и сортировкой на сервере. Для публичного запуска остаются проблемы полноты, свежести, standings/box score и upstream-прав. Интеграция в production не рекомендуется.

## Фактические ответы

Все ответы содержали `x-api-key-status: none` и `Access-Control-Allow-Origin: *`. CORS header наблюдался на GET-ответах; отдельный browser-origin запрос не выполнялся.

| # | Endpoint и slug | HTTP / тип | Что вернулось |
|---:|---|---|---|
| 1 | `/api/widget/matches/?sport=basketball&limit=5` | 200 / JSON | `count=5`; в top-5 одна NBA-игра и четыре матча других basketball-лиг. NBA sample: Washington Wizards 119 — Houston Rockets 147, `finished`, `time=2026-11-16T00:00:00Z`. |
| 2 | `/api/widget/standings/?sport=basketball&slug=national-basketball-association` | 404 / JSON | `{"error":"No standings data"}`. Slug взят из [официального embed-примера](https://sportscore.com/embed/), не подобран перебором. |
| 3 | `/api/widget/match/?sport=basketball&slug=washington-wizards-vs-houston-rockets` | 200 / JSON | Та же игра; поля `live_minute=null`, `incidents=[]`, `stats=[]`, `lineups=null`. Есть tracker reference, но нет game ID, period linescore или player box-score rows. Slug взят из ответа #1. |
| 4 | `/api/widget/tracker/?sport=basketball&id=<id из ответа #3>` | 200 / HTML | Страница с iframe на `widgets-v2.thesports01.com`; не структурированный feed. Tracker ID не сохраняется в fixture. |
| 5 | `/api/widget/team/?sport=basketball&slug=chicago-bulls&limit=5` | 200 / JSON | Пять NBA матчей `upcoming`. Даты возвращены в обратном порядке: с 11 апреля к 4 апреля 2027. На дату запроса ближайший матч таким ответом не стал; контракт сортировки не описан. Slug взят из [публичной страницы команды](https://sportscore.com/basketball/team/chicago-bulls/kjw2r02tdkkqz84/). |
| 6 | `/api/widget/matches/?sport=basketball&limit=50` | 200 / JSON | Ровно 50 записей разных соревнований: 5 NBA, из них 3 завершённых за NBA date 15 ноября и 2 будущих. В листинге нет pagination cursor/next field. |
| 7 | `/api/widget/player/?sport=basketball&slug=rayj-dennis` | 200 / JSON | Профиль найден, `stats=null`. Slug взят из [публичной страницы игрока](https://sportscore.com/basketball/player/rayj-dennis/ednm9kt9xpjryox/). |

Обезличенные и сокращённые snapshots лежат в [fixture](./fixtures/sportscore-pro-183.json). Из него исключены logo URLs, HTML/CF boilerplate, tracker ID и не относящиеся к проверке поля.

## Свежесть, лимиты и даты

| Ответ | `Date` заголовок | `updated` в body | Cache observation |
|---|---|---|---|
| matches, limit 5 | 13:02:40 UTC | 12:15:47 UTC — примерно 46 мин 53 с до запроса | `max-age=60`, `x-sc-widget-cache: STALE` |
| match detail | 13:03:13 UTC | 12:59:23 UTC — примерно 3 мин 49 с до запроса | `max-age=30`, `x-sc-widget-cache: STALE` |
| team | 13:04:41 UTC | 13:04:41 UTC | `max-age=60`, `x-sc-widget-cache: MISS` |
| player | 13:06:16 UTC | поле отсутствует | `max-age=300` |
| tracker | 13:04:38 UTC | поле отсутствует | `text/html`, `max-age=300` |

Это возраст snapshot-поля `updated`, а не непосредственно измеренная задержка scoreboard. Однако два ответа с внутренним статусом `STALE` были старше их HTTP `max-age`; SLA и гарантированный in-game polling в этих ответах не подтверждены. Публичная документация заявляет около 10,000 запросов/24h/IP, но limit headers и pagination сверх указанных параметров не наблюдались.

В матче `2026-11-16T00:00:00Z` соответствует 15 ноября 19:00 EST (NBA date) и 16 ноября 02:00 в Europe/Nicosia. Это согласуется с date model в [PRO-163 report](./dunkapi-spike.md); timezone не следует выводить из локальной даты зрителя.

## Сопоставление с сохранёнными результатами DunkAPI

В PRO-163 артефакте сохранено, что DunkAPI вернул **9 завершённых игр за NBA date 2026-11-15**, но per-game строки со score/team IDs в документе не оставлены. Поэтому повторно подтвердить конкретный score SportScore через прежний DunkAPI payload нельзя без новых кредитов; таких запросов не делалось. В SportScore limit-50 sample видны только три завершённые NBA игры этой даты — выборка смешана с другими лигами и недостаточна для полного дневного списка.

Score Wizards–Rockets и UTC timestamp сохранены в smoke evidence, но не объявляются проверенным межисточниковым совпадением. External IDs в ответе source-scoped: в matches используются URL slugs, общего стабильного game/team ID в просмотренной записи нет. Нормализация должна ключевать IDs по `(source, source_id)`, а матч сопоставлять по mapped teams + NBA date + home/away; не сливать данные автоматически по счёту или имени.

## Публичный сайт и ограничения

BuzzerBoard сейчас показывает пустые состояния и имеет общий footer в [AppShell](../src/app/AppShell.vue). Условия SportScore разрешают поместить видимый `Powered by SportScore` dofollow link в footer, если он остаётся видимым на каждой странице/поверхности с этими данными. В текущем footer ссылки нет; при подключении она должна отображаться на всех соответствующих маршрутах. Это выполнимо по структуре интерфейса, но не устраняет недостаток coverage и upstream-rights blocker.

Фактический ответ содержит URL командных/соревновательных логотипов с `img.thesports.com`; право публичного использования NBA/team logos и likeness по открытым terms отдельно не подтверждено. Поставщик указывает, что нормализует данные из нескольких upstream providers, но не указывает источник по каждому dataset. API Terms и attribution не трактуются как доказательство upstream-лицензии.

### По разделам BuzzerBoard

- **Матчи / недавние результаты:** API подтверждает несколько NBA игр, но общий `matches` endpoint смешивает соревнования и cap sample неполон; не использовать как полный NBA slate.
- **Командное расписание:** `team` endpoint вернул текущесезонные NBA игры, но проверенный limit-5 отсортирован от поздних дат к ранним. До использования проверять полноту/сортировку и сортировать по UTC timestamp, сохраняя NBA Eastern date.
- **Турнирная таблица:** API для документированного NBA competition slug данных не вернул. В BuzzerBoard standings не подключать; rank/seed не выводить.
- **Live / box score / player history:** live JSON не подтверждён; tracker — HTML iframe. Box score отсутствует в проверенных ответах, profile stats null. Для этих разделов SportScore не подходит по smoke evidence.
- **Новости:** проверенные endpoints news не предоставляют.

## Условия SportScore и следующий вывод

[Terms](https://sportscore.com/developers/terms/) обновлены 23 апреля 2026 года и применимы к `/api/widget/`: примерно 10k requests/24h/IP, бесплатное использование ранними коммерческими проектами с видимой crawlable dofollow-ссылкой на каждой поверхности с данными; ответы можно кэшировать и комбинировать. Гарантированного SLA нет; данные идут из нескольких upstream providers, точность не гарантируется. Условия относятся именно к `/api/widget/`; переносить их на `/api/v1/` нельзя.

**Рекомендация:** не выбирать SportScore как production primary/fallback для всего BuzzerBoard. Можно сохранить как условный POC-кандидат для ограниченного recent/team-schedule widget при обязательной атрибуции и отдельной проверке upstream-прав; полный NBA scoreboard, standings, live JSON, box scores и player history smoke не подтвердил. В этом spike выполнено ровно 7 GET — все без ключей; платных подписок и расходов DunkAPI нет.
