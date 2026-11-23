# PRO-206 · City Guide NBA

Справочник проверен 23 ноября 2026 года. Текущие домашние площадки взяты из Arena Guide сезона 2026/27. `cityId` и `arenaId` принадлежат Team Encyclopedia. Каталог агрегирует назначения по `cityId`, а города и боро остаются самостоятельными записями справочника.

| Данные                   | Покрытие и границы                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Франшизы, места и арены  | 30 франшиз, 30 place IDs, 29 географий на муниципальном уровне с учётом округа Колумбия. В статистике Нью-Йорка есть Бруклин, у которого собственная карточка.      |
| Контекст                 | 30 авторских русских описаний, штат/провинция, страна, тип места и зона IANA. Исторические даты с определением события проверены для восьми мест.                   |
| Население                | 30/30. США: оценка на 1 июля 2025 года, Vintage 2025. Торонто: перепись 2021 года, муниципалитет 3520005 (2 794 356 чел.).                                          |
| Площадь суши             | 30/30. США: Census Gazetteer 2020, ALAND в м² переведена в км². Торонто: Statistics Canada 2021 (631,10 км²).                                                       |
| Географические точки     | 30/30. Для США — основные точки USGS GNIS, NAD83, из ноябрьского выпуска 2026. Для Торонто — географическая точка города из инженерного руководства 2021 года.      |
| Панорамы                 | 7/30: Чикаго, Лос-Анджелес, Миннеаполис, Бруклин, Нижний Манхэттен, Сан-Франциско и Торонто. У остальных 23 мест текстовый hero с географией.                       |
| История и другие команды | Проверенные даты инкорпорации или административного события подписаны отдельно. Другие команды появляются выборочно по подтверждённым данным операторов арен и лиг. |

## Привязки сезона 2026/27

Обозначения географии в таблице относятся к текущей арене. Статистические коды позволяют однозначно найти границы и исходные данные по каждому месту.

| Франшиза | Место и физический муниципалитет                     | Домашняя арена           | Census / StatCan |
| -------- | ---------------------------------------------------- | ------------------------ | ---------------- |
| ATL      | Atlanta, Georgia                                     | State Farm Arena         | 1304000          |
| BKN      | Brooklyn, боро и Kings County · New York City, NY    | Barclays Center          | 36047            |
| BOS      | Boston, Massachusetts                                | TD Garden                | 2507000          |
| CHA      | Charlotte, North Carolina                            | Spectrum Center          | 3712000          |
| CHI      | Chicago, Illinois                                    | United Center            | 1714000          |
| CLE      | Cleveland, Ohio                                      | Rocket Arena             | 3916000          |
| DAL      | Dallas, Texas                                        | American Airlines Center | 4819000          |
| DEN      | Denver, Colorado                                     | Ball Arena               | 0820000          |
| DET      | Detroit, Michigan                                    | Little Caesars Arena     | 2622000          |
| GSW      | San Francisco, CA · региональный бренд Golden State  | Chase Center             | 0667000          |
| HOU      | Houston, Texas                                       | Toyota Center            | 4835000          |
| IND      | Indianapolis, IN · Indiana и границы city (balance)  | Gainbridge Fieldhouse    | 1836003          |
| LAC      | Inglewood, CA · бренд LA Clippers                    | Intuit Dome              | 0636546          |
| LAL      | Los Angeles, California                              | Crypto.com Arena         | 0644000          |
| MEM      | Memphis, Tennessee                                   | FedExForum               | 4748000          |
| MIA      | Miami, Florida                                       | Kaseya Center            | 1245000          |
| MIL      | Milwaukee, Wisconsin                                 | Fiserv Forum             | 5553000          |
| MIN      | Minneapolis, MN · бренд штата Minnesota              | Target Center            | 2743000          |
| NOP      | New Orleans, Louisiana                               | Smoothie King Center     | 2255000          |
| NYK      | Manhattan, боро · New York City, NY                  | Madison Square Garden    | 3651000          |
| OKC      | Oklahoma City, Oklahoma                              | Paycom Center            | 4055000          |
| ORL      | Orlando, Florida                                     | Kia Center               | 1253000          |
| PHI      | Philadelphia, Pennsylvania                           | Xfinity Mobile Arena     | 4260000          |
| PHX      | Phoenix, Arizona                                     | Mortgage Matchup Center  | 0455000          |
| POR      | Portland, Oregon                                     | Moda Center              | 4159000          |
| SAC      | Sacramento, California                               | Golden 1 Center          | 0664000          |
| SAS      | San Antonio, Texas                                   | Frost Bank Center        | 4865000          |
| TOR      | Toronto, Ontario, Canada · census subdivision        | Scotiabank Arena         | 3520005          |
| UTA      | Salt Lake City, UT · бренд штата Utah                | Delta Center             | 4967000          |
| WAS      | Washington, District of Columbia · федеральный округ | Capital One Arena        | 11001            |

- **Границы.** Brooklyn совпадает с Kings County и входит в New York City. Метрики NYK охватывают все пять боро и не означают численность Манхэттена. Inglewood и Los Angeles — отдельные муниципалитеты. Перенос Warriors из Окленда отражён в тексте и истории команды. Текущая статистика относится к Сан-Франциско. [NYC311](https://portal.311.nyc.gov/article/?kanumber=KA-02877), [Municipal Archives](https://a860-collectionguides.nyc.gov/repositories/2/resources/74), [NBA о Warriors и Bay Area](https://www.nba.com/news/bay-area-basketball-history-2025-nba-all-star).
- **Сопоставимость.** Indianapolis city (balance) исключает отдельно учтённые муниципалитеты внутри консолидированного города. Для Washington используются границы округа Колумбия. Сортировка по населению и суше использует опубликованные числа, подписи показывают годы и типы границ. Показатели агломераций и ранги городов отсутствуют. [Определение Census C8](https://www.census.gov/library/reference/code-lists/class-codes.html), [файлы Vintage 2025](https://www.census.gov/data/datasets/time-series/demo/popest/2020s-total-cities-and-towns.html).
- **Арены и команды.** Физическое место подтверждают адрес оператора и каталог NBA. Для Spurs включён отдельно проверенный Moody Center в Остине. Подтверждённые домашние арены и адреса перечислены в [Arena Guide](./pro205-arena-guide.md). [Каталог арен NBA](https://www.nba.com/news/all-30-nba-arenas-by-team), [Moody Center](https://moodycenteratx.com/fast-facts/).

## Реестр источников

| Факт                                   | Источник и срез                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Население городов США                  | [SUB-EST2025 CSV](https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/cities/totals/sub-est2025.csv), строки SUMLEV 162, поле POPESTIMATE2025 по FIPS STATE+PLACE.                                                                                                                                                                                                                                                                                                              |
| Население Бруклина и Вашингтона        | Census QuickFacts, оценка Vintage 2025 для [Kings County 36047](https://www.census.gov/quickfacts/fact/table/36047/PST045225) и [District of Columbia 11001](https://www.census.gov/quickfacts/table/PST045215/11001).                                                                                                                                                                                                                                                                         |
| Суша США                               | [2020 Gazetteer](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2020.html), таблицы places и counties. Использовано поле ALAND.                                                                                                                                                                                                                                                                                                                            |
| Население, суша и территория Торонто   | [Statistics Canada, Census of Population 2021](https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?geocode=S051235203519&pid=9810001501&request_locale=en), [граница муниципалитета 3520005](https://www12.statcan.gc.ca/census-recensement/2021/geo/maps-cartes/static-statique/pdf/A0005/2021A00053520005.pdf).                                                                                                                                                                                |
| Точки США                              | [USGS GNIS, Populated Places](https://www.usgs.gov/us-board-on-geographic-names/download-gnis-data), поля prim_lat_dec/prim_long_dec. Идентификаторы GNIS сохранены рядом с точками. [Правила определения основной точки и NAD83](https://www.usgs.gov/us-board-on-geographic-names/what-geographic-names-information-system-gnis).                                                                                                                                                            |
| Точка Торонто                          | [City of Toronto, Green Infrastructure Design Criteria](https://www.toronto.ca/wp-content/uploads/2021/09/965f-ecs-specs-gi-design-criteria-manual-Sep2021.pdf), 43,6532° N, 79,3832° W.                                                                                                                                                                                                                                                                                                       |
| Местное время                          | [IANA TZDB](https://www.iana.org/time-zones), [NIST о DST](https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst), [границы зон США](https://www.ecfr.gov/current/title-49/subtitle-A/part-71), [Ontario Time Act](https://www.ontario.ca/laws/statute/90t09). Финикс без сезонного перевода. Торонто использует America/Toronto.                                                                                                                        |
| Исторические даты и редакционные факты | Источники у каждого факта в `cityEditorial.ts` и на странице. Среди них архивы [Чикаго](https://chicago.gov/city/en/about/history.html), [Лос-Анджелеса](https://streets.lacity.gov/about-us/history), [Торонто](https://www.toronto.ca/explore-enjoy/history-art-culture/online-exhibits/web-exhibits/web-exhibits-significant-events/toronto-in-1834/) и [Сан-Франциско](https://www.sfgov.org/services/city-organization-chart). Для Инглвуда указан только согласованный год инкорпорации. |

Государственные географические и статистические значения USGS/Census взяты из открытых выпущенных таблиц. Агрегаты Statistics Canada использованы с указанием источника по [Open Licence](https://www.statcan.gc.ca/en/reference/licence).

## Фотографии

Пилотные виды Чикаго, Лос-Анджелеса и Миннеаполиса сохранены. Новые файлы проверены индивидуально по страницам Commons и `imageinfo/extmetadata`. Локальные JPEG и сведения об авторе, дате, лицензии, уменьшении и кадрировании зарегистрированы в `teamMediaManifest.json`.

| Место                      | Автор, дата и лицензия                       | Файл                                                                                                                                                           |
| -------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Бруклин                    | Kidfly182 · 09.03.2023 · CC BY-SA 4.0        | [Downtown Brooklyn.jpg](https://commons.wikimedia.org/wiki/File:Downtown_Brooklyn.jpg)                                                                         |
| Нью-Йорк, Нижний Манхэттен | PointsofNoReturn · 10.01.2019 · CC BY-SA 4.0 | [Lower Manhattan Seen from Jersey City.jpg](https://commons.wikimedia.org/wiki/File:Lower_Manhattan_Seen_from_Jersey_City.jpg)                                 |
| Сан-Франциско              | Pi.1415926535 · 07.08.2021 · CC BY-SA 4.0    | [Ferry Building and The Embarcadero](https://commons.wikimedia.org/wiki/File:Ferry_Building_and_The_Embarcadero_from_the_Bay_Bridge,_August_2021.jpg)          |
| Торонто                    | Chicken4War · 28.08.2026 · CC BY-SA 4.0      | [Skyline of Toronto from viewpoint on Toronto Islands](https://commons.wikimedia.org/wiki/File:Skyline_of_Toronto_from_viewpoint_on_Toronto_Islands,_2026.jpg) |

На 23.11.2026 нет панорам для ATL, BOS, CHA, CLE, DAL, DEN, DET, HOU, IND, LAC, MEM, MIA, MIL, NOP, OKC, ORL, PHI, PHX, POR, SAC, SAS, UTA и WAS. На этих страницах видны место и метрики. При ошибке JPEG доступна атрибуция источника. OpenStreetMap представлен внешней ссылкой с указанием [авторства](https://www.openstreetmap.org/copyright).

## География матчей

Место встречи берётся из поля `Game.venue` конкретного матча, если оно однозначно совпало с известной площадкой. Для проверенных прежних названий учитывается период их использования. Неизвестное имя оставляет место неподтверждённым. Если поле пустое, доступно справочное время города хозяев с явной подписью. При известной площадке показывается её зона. Отдельные строки показывают игровую дату и время ET и время зрителя. Форматирование даты и смещения выполняет `Intl.DateTimeFormat`.

При наличии двух подтверждённых центров показывается сферическое расстояние по прямой: `R = 6371,0088 км`, формула гаверсинусов и округление до целого километра только при выводе. Для Nets в таком расчёте используется муниципальный центр Нью-Йорка. Бруклин остаётся отдельным местом команды, поэтому встреча Nets и Knicks имеет нулевое расстояние между муниципальными центрами. При нейтральной или выездной для назначенных хозяев площадке, нераспознанном имени арены, неизвестной команде или матче до начала сезона текущих домашних привязок выводится пояснение. Карточка работает с существующим снимком матча и исключает результаты из географического блока. Данные о маршрутах и последовательности поездок в справочнике отсутствуют.

## Проверки

- Unit-тесты покрывают 30 назначений, границы, даты и времена, записи без чисел, расстояние, распознавание площадки и исторический переезд.
- Playwright проверяет каталог и геокарточку, 8 репрезентативных профилей, фильтры и историю URL, связки с командой и ареной, ошибку изображения и Spoiler Mode. Используются синтетические данные и текущий компактный CI. Полный визуальный аудит доступен в ручном workflow.
