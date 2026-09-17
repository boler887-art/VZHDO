# ТОО «ВЖДО» — дашборд исполнительской дисциплины

GitHub Pages: `https://boler887-art.github.io/VZHDO/`

## Запуск

```bash
npm install
npm run dev
```

## Сборка для GitHub Pages

Репозиторий должен называться `VZHDO` (base path `/VZHDO/`).

```bash
npm run build
```

Папку `dist/` публиковать как GitHub Pages (Deploy from branch / `/docs` или Actions).

В `public/`:
- `structure.xlsx` — оргструктура, грузится автоматически
- `assets/vzhdo-logo.png` — корпоративный логотип

Пользователь загружает только `1.xlsx`, `2.xlsx`, `3.xlsx`.
