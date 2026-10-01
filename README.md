# USA Atlas — selected design studies

## Current UI — 20 September, feedback synthesis

The assembled interface is `/ux/`. Current review server: [San Francisco](http://127.0.0.1:4198/ux/?concept=explorer&place=06075&metric=unemployment&view=3d), [California](http://127.0.0.1:4198/ux/?concept=explorer&place=06&metric=unemployment&view=3d), [Compare](http://127.0.0.1:4198/ux/?concept=compare&place=06&other=48&metric=unemployment&view=3d). Normal `npm start` still serves the same code on 4180.

The current shell uses white/graphite/Geist, **Trends / Explorer / Compare**, a photo-led scrolling left profile, selected-place Quick stats and a labelled ad placeholder on the right. Search and categories remain; curated popular indicators sit below the chooser. Highest / Lowest show five raw values with coverage/ties and matching 3D labels. Saved replaces the left frame with a Back action and stores up to 50 views locally. Saved periods are labelled, but reopening reads the latest available source snapshot. Share confirms in its own button for five seconds. Surprise opens prepared scenarios; its full-width ticker pauses on hover/focus and supports reduced motion.

[Asset sources and licenses](ux/assets/SOURCES.md) and [current design rules](ux/DESIGN.md) are part of this repository. The wider workspace keeps research and synthesis evidence outside the UI source repository. Paper 107–112 are explicitly labelled browser captures for commenting; the working transitions are in `/ux/`.

The September 19 sections below record the preceding UI iterations. Their warm/dark color styling and Stories label are historical; geography, source fidelity and camera contracts continue to apply. The `concept=stories` URL remains compatible and now opens Trends.

## Repository boundary

This is the UI side of a two-repository system. Collection, normalization, provenance
and database loading live in the separate
[`usa-atlas-data-collection`](https://github.com/66dplus/usa-atlas-data-collection)
repository. This UI owns rendering, navigation, comparisons, interaction state and a
read-only adapter for admitted observations.

The repositories connect through the `usa_atlas` PostgreSQL contract: stable catalog
and series IDs, typed geography IDs, values, units, periods, source releases and
provenance. The UI does not import collector code, read provider credentials, start
collection jobs or infer finer values from coarser observations. A contract change in
the data repository requires a compatible adapter/fixture change here and verification
against exact revisions of both repositories.

The UI runtime reads the checked-in `ux/catalog.json`; observations come from the
read-only `usa_atlas` PostgreSQL interface in `scripts/atlas_data.py`. The catalog is
derived from `source/us_map_statistics_catalog.docx` in the data repository. To refresh
it, fetch that document from the linked repository and pass its local path explicitly
to `ux/extract-catalog.py`; the UI does not assume the data repository is a sibling
checkout.

Рабочая дизайн-лаборатория интерактивной карты США. После первого раунда выбраны три направления:

- `01 Orbital` — 3D-глобус с радиальными колоннами.
- `02 Ember` — 3D-поле тонких пиков на плоской географии США.
- `06 Blue hour` — 2D-мозаика округов.

Остальные семь экранов сохранены в интерфейсе как исследовательские варианты, но не входят в текущий рабочий handoff.

## Запуск

```bash
npm install
npm start
```

Сайт откроется на `http://127.0.0.1:4180/`. Прямые ссылки на выбранные варианты:

- `http://127.0.0.1:4180/?study=01`
- `http://127.0.0.1:4180/?study=02`
- `http://127.0.0.1:4180/?study=06`

Индекс показателя тоже можно закрепить в URL: `?study=02&metric=5`. Допустимые значения `metric`: `0–9` в порядке, заданном в `field.js`.

## Проверка и пересборка

```bash
npm run check
npm run assets
```

`npm run check` проверяет структуру географии, синтетический генератор и все ресурсы выбранных вариантов. `npm run assets` заново собирает географический JSON и статические SVG/PNG-композиции.

Машиночитаемый список выбранных направлений: [`handoff/selected-studies.json`](handoff/selected-studies.json).

## Статус данных

Границы и координатная регистрация реальные. В оригинальной галерее `/` значения синтетические. Интерактивный атлас `/ux/` читает реальные наблюдения PostgreSQL; см. раздел подключения ниже.

## Three interactive UI concepts — September 19

Open the new prototypes while the same `npm start` server is running:

- [Explorer](http://127.0.0.1:4180/ux/?concept=explorer): geographic map, state/county navigation and a configurable data card.
- [Stories](http://127.0.0.1:4180/ux/?concept=stories): dark terrain, topic shortcuts and a fitted 3D view when a state is selected.
- [Compare](http://127.0.0.1:4180/ux/?concept=compare): two places or two indicators, with equal maps and a comparison table.

Click a state and then a county, or use **Find a place**. **2D map / 3D terrain** preserves the selected geography and indicator; old Globe links open terrain. Drag with the left or right mouse button to pan; scroll or pinch to zoom toward the pointer. Rotation is off by default, camera tilt is 40 degrees, and zoom spans 0.5-12x the fitted view (adjustable up to 30x). Surrounding states dim smoothly on selection; click the background, the back button, or Escape to restore the exact overview camera. Clicking a dimmed neighbouring state focuses that state directly; counties within the current state remain selectable. The owner's 950 ms transition is preserved. Pointer tilt is disabled entirely. Reset fits the selected place. Alaska and Hawaii occupy actual Mercator coordinates, with jump buttons; other countries form dark geographic context. Close-ups frame the main landmass when remote tiny islands would dominate the viewport; all islands remain on the map. Geometry is Census 2017, including 50 states, DC and 3,142 county equivalents, not a claim to current administrative boundaries.

The 81-field library in `ux/catalog.json` is exported from the catalog document owned by `usa-atlas-data-collection`. **Choose fields** changes the inspector card; the two comparison modes have their own indicator/place selectors. **Copy view link** writes a local URL to the clipboard and reproduces the concept, selected geography, comparison, indicators and dimension. It does not publish a site.

The interactive UI now reads **PostgreSQL observations**, with original units, observation period, source and release. Missing or unavailable values remain gray/dashes. HUD and other uncollected layers remain discoverable but have no values; no county values are inferred from other geographic levels. No tract-level or address-level data is provided. Three.js terrain extrudes each full county polygon, including islands and holes. A county has one uniform source value, not invented sub-county measurements. At deep county zoom, relief is scaled equally across the view so tiny counties remain readable; colour retains the fixed national scale. The default relief is twice the previous iteration: 1x now matches its former 2x (eight times the original baseline). Selection preserves data colours: state perimeters follow each county cap, and a selected county has its own white surface outline instead of a floating state outline.

The new code is isolated in `ux/`: `app.js` owns the interface state, `model.js` owns asynchronous observations, missingness and display normalization, `map.js` owns actual geography and cameras, and `catalog.json` retains source catalog metadata. Existing gallery files and assets are preserved. Existing map packages and licenses remain: Three.js 0.186.0 (MIT), D3 7.9.0 (ISC), topojson-client 3.1.0 (ISC), us-atlas 3.0.1 and world-atlas 2.0.2 (ISC redistribution; Census / Natural Earth geometry). Exact versions are in `package-lock.json`; updates should re-run the checks and camera/geography flow.

```bash
# Keep npm start running in another terminal.
node ux/check.mjs
npm run check
# Re-extract the catalog from the preserved source, if it is intentionally updated:
python3 ux/extract-catalog.py /path/to/usa-atlas-data-collection/source/us_map_statistics_catalog.docx --output ux/catalog.json
```

The standard prototype runs locally. A small loopback Python backend saves comments and view settings; the same backend reads the separately loaded local PostgreSQL database. A separate read-only mobile preview is described below. Source collection lives in the data repository. Historical U1–U7 evidence remains in the wider workspace archive.


## Комментарии и настройка 3D

`npm start` теперь запускает `python3 scripts/serve.py` на **127.0.0.1:4180**. Нужен Python 3 и установленные npm-зависимости. Старый `python3 -m http.server` показывает страницу, но не умеет сохранять комментарии и настройки. Уровень географии — **округ / county (или county equivalent)**, не городской район. Некоторые независимые города считаются county equivalent.

**Комментировать** → указать место → изменить рамку → написать текст → **Сохранить**. Рамка по умолчанию 480×320 CSS px, обрезается по краям окна. Её можно двигать, тянуть за углы или менять ширину/высоту числом. Отмеченная точка остаётся внутри. Клавиатура: стрелки двигают указатель, Shift ускоряет его, Enter выбирает точку, Esc отменяет. При смене размера окна требуется выбрать область заново, текст сохраняется. Кнопка **Все** открывает сохранённые комментарии.

Каждый комментарий лежит в `../feedback/<UUID>/`: `capture.png`, `comment.json`, `comment.md`. PNG содержит выбранную область и маркер точки. JSON содержит URL, состояние карты, выбранную географию/FIPS, фактическую камеру, настройки, DOM-селектор, исходный файл/функцию/строку и SHA-256 исходника. Для canvas привязка ведёт к владельцу рендера и географическому объекту сцены. Номер строки — на момент комментария; после изменения кода ориентируйтесь также на функцию и хеш. Сервер сам разрешает фиксированный ключ компонента в файл; путь клиента не используется.

Снимок делает **html2canvas 1.4.1 (MIT)**: это восстановление DOM с настоящими пикселями WebGL canvas, а не снимок ОС. Шрифты, SVG и карты проверены; нативные элементы вроде стрелки раскрытия могут немного отличаться. Предпросмотр — тот PNG, который сохранится. [Документация html2canvas](https://html2canvas.hertzen.com/documentation). Обновление зависимости требует повторить проверки снимков в 2D, 3D, панели статистики и шапке.

**Настройки 3D** меняют наклон, сторону взгляда, вращение, чувствительность и границы зума, длительность перехода и высоту рельефа. Значения применяются к обеим картам сразу. **Сохранить настройки** записывает `../feedback/view-settings.json`; он автоматически читается после перезагрузки и доступен Codex. Без этого файла используются явно обозначенные значения по умолчанию. В браузере ничего не считается сохранённым до ответа сервера. Комментарии и настройки не отправляются в чат автоматически.

Сервер слушает только loopback, проверяет Host/Origin, ограничивает размеры и сохраняет комментарии атомарно. Повтор запроса с тем же UUID и содержимым не создаёт копию; другое содержимое с тем же UUID отклоняется. Настройки заменяются атомарно. Удаление и редактирование старых комментариев не предусмотрено.

Falls Church (51610) выродился в линию в упрощённом `us-atlas@3.0.1`. `ux/county-boundary-repair.json` содержит согласованные границы всех 133 округов и независимых городов Вирджинии из [официального Census TIGERweb ACS2017](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2017/MapServer/84), с URL запроса и хешем ответа. Один набор точности сохраняет общие границы и отверстия вокруг независимых городов без щелей от смешивания источников. Остальная география остаётся прежней Census 2017. Это исправление геометрии, а не обновление статистики.

Проверки:

```bash
npm run check
node ux/check.mjs                 # при работающем сервере 4180
node ux/check-geometry.mjs        # все 3142 округа, отверстия, острова, попадание в объём
node ux/check-motion.mjs          # отмена переходов, возврат камеры, границы зума
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_feedback.py'
# Отдельный сервер для проверок, не засоряющий ваши комментарии:
python3 scripts/serve.py --port 4182 --feedback-dir /tmp/atlas-review-test
```

Код: `ux/feedback.js` владеет комментарием/рамкой/снимком, `ux/settings.js` — настройками, `ux/map.js` — камерой и переходами, `ux/geometry.js` — объёмными границами. `scripts/serve.py` и `view_settings.py` сохраняют локальные данные; `feedback_sources.py` задаёт связь с исходниками. Файлы данных находятся **за пределами публичного каталога**. Для отката интерфейса эти файлы удалять не нужно.


### Detailed boundaries and navigation

Selecting a state loads local `ux/boundaries/<FIPS>.json`: [Census ACS2017 cartographic boundaries at 1:500,000](https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2017/State_County/MapServer/5), with detailed coastlines and islands. The 51 files cover all 3,142 counties, but only selected states load in the browser. `manifest.json` records the query, byte sizes and source/output hashes. To regenerate, save each documented state query response as `<FIPS>.json`, then run `node ux/build-boundaries.mjs <response-directory>` and `node ux/check-detail.mjs`. These are generalized cartographic boundaries, not cadastral or Google street-map detail. The existing Virginia repair remains the fast overview fallback.

2D labels show major cities, with more appearing on zoom; counties are named on hover and selection. Collision checks avoid per-frame DOM measurements. The old `hover` settings field remains for schema compatibility but has no effect and saves as zero.

Ports 4180 and 4181 can serve the same owner feedback directory to support an existing owner tab. Isolated checks use a separate port and feedback directory. Navigation self-check evidence remains in the wider workspace archive.


### Map as the workspace (September 19, map-first iteration)

`/ux/` now fills the screen with geography in all three modes. Each map has explicit **Place** and **Indicator** buttons. In Compare, the left chooser slides in on the left and the right chooser on the right; on narrow screens, choosers expand into a readable full-height sheet with the map side labelled. **Two places** shares one indicator; **Two indicators** shares one place. The chooser states whether a change applies to one or both maps.

Click a map's **Statistics** value to open its profile. **Compare data** opens the table from below. Stories has a closable **Browse stories** shutter. These overlays leave camera framing and map dimensions unchanged; Escape closes the active tool without clearing the selected place. Camera settings are behind the slider icon beside 2D/3D. Feedback remains available through **Комментировать**, including screenshot crops and source bindings for the new controls.

Self-check evidence and pre-change snapshots remain in the wider workspace archive. This is a layout iteration; 3D geometry, saved owner preferences and the original gallery are preserved.


## Реальные данные PostgreSQL — 20 сентября 2026

Откройте [интерактивный атлас](http://127.0.0.1:4180/ux/). Оригинальная галерея
на `/` остаётся исследованием дизайна с синтетическими значениями.

Перед запуском нужны работающий PostgreSQL, база **usa_atlas**, схема **usa_atlas**
с таблицами `catalog_field`, `observation`, `ingest_run` и клиент `psql` в PATH.
Подключение использует обычные переменные libpq (`PGHOST`, `PGPORT`, `PGUSER`,
при необходимости `PGPASSFILE`), заданные вне публичного каталога. База закреплена
как `usa_atlas`; `PGDATABASE` её не меняет. Пароли в браузер не передаются.
Проверено с установленным PostgreSQL/psql **16.13** (PostgreSQL License).
Новых Python/npm-зависимостей не добавлено.

```bash
psql -X -d usa_atlas -c 'SELECT source, row_count, status FROM usa_atlas.ingest_run'
npm start
```

Сервер читает только завершённые загрузки (`status=pass`) в транзакциях `READ ONLY`;
есть таймауты подключения/запроса/процесса. Он не запускает сборщик, не загружает
строки и не изменяет схему. `GET /api/atlas/catalog` возвращает каталог и доступные
ряды. `GET /api/atlas/observations?field=03.06%3Aunemployment_rate` читает один ряд.
Неверные параметры дают 400, отсутствующий ряд — 404, недоступная база — 503.

Сейчас доступны **32 ряда для карты** из **81 каталожного показателя**. В базе
1 031 001 наблюдение восьми источников; это не число полигонов на карте. IRS ZIP
и EPA monitor остаются видимыми пробелами покрытия без выдуманного распределения
по округам. ACS пока не загружен. BLS содержит месячные значения, например
**Dec 2024**, а не годовое среднее. Разные поддерживающие ряды BLS, сектора EIA,
виды преступлений и абсолютный/процентный показатель доступа к магазинам выбираются
отдельно в Indicator. Первым открывается Unemployment rate.

Каждый ряд использует один последний период и релиз из базы для всех мест.
Старые значения не подставляются для отсутствующих мест. Исходные значения,
единица, источник, период и релиз доступны в Statistics → Source, coverage & method.
US отображается только при наличии опубликованного наблюдения, без среднего
по штатам. Данные округов не агрегируются в штат; данные штата не становятся
измерениями округов. Для слоя штатов одинаковая заливка округов обозначает
показатель штата; карточка выбранного округа остаётся пустой.

FBI/EIA abbreviations и BEA state IDs приводятся к FIPS; округ присоединяется
только по точному FIPS геометрии Census 2017. Число исключённых географий указано
в подробностях источника. В частности, новые planning regions Connecticut не
подменяют старые округа. Отсутствующие наблюдения не становятся нулями.

Цвет/высота используют линейный диапазон min–max доступных мест одного ряда,
фиксированный для страны и обоих сравниваемых мест. Исходное число показывается
в карточке/tooltip, границы и единицы диапазона — в легенде. При сравнении двух
показателей шкалы независимы и подписаны отдельно. Разность доступна только для
одинаковых рядов, периода, релиза, единиц и уровня географии; для процентов это
процентные пункты. Поля карточки сохраняют собственные единицы и периоды.

USDA использует исходные единицы из сохранённого `VariableList.csv`: рестораны,
рынки и recreation facilities — **на 1 000 жителей** (старый каталог говорил
«на 10 000»); access to store — население с **низкой** доступностью. Числа в базе
не пересчитывались и не изменялись.

Браузер загружает ряды по запросу и сохраняет их в памяти до перезагрузки.
Ошибка запроса явно показывается в Statistics с кнопкой **Retry data**; ошибка
каталога — с **Reload atlas**. Перезагрузка заново читает PostgreSQL. Локальные
ресурсы сервера отправляются с `no-store`, чтобы правки не оставляли старую модель.

```bash
# Изолированная проверка; не изменяет базу или комментарии владельца:
python3 scripts/serve.py --port 4182 --feedback-dir /tmp/atlas-postgres-test
ATLAS_BASE_URL=http://127.0.0.1:4182 node ux/check.mjs
node ux/check-data.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p 'test_atlas_data.py'
```

`scripts/atlas_data.py` — чтение БД, каталог, идентификаторы и единицы;
`ux/model.js` — загрузка и нормализация; `ux/app.js` — отображение и сравнение.
Снимок до подключения, исходные SQL-сверки и результаты проверки сохранены в
архиве рабочей области. Откат к прежним исходникам не требует
изменять базу, комментарии или сохранённые настройки камеры.

## Временное мобильное превью

Настройка отдельного Docker-превью и Cloudflare Quick Tunnel находится в
[deploy/mobile-preview/README.md](deploy/mobile-preview/README.md). Оно использует
реальные данные PostgreSQL в режиме чтения. Карта пока отображает измерения
штатов и округов; данные tract и block group требуют отдельной интеграции в UI.
