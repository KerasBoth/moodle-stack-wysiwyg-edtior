# STACK Editor for Moodle

A self-hosted web editor for [STACK](https://stack-assessment.org/) questions in Moodle XML format. It gives question authors a proper code editor for Maxima and CASText, a graphical view of potential response trees (PRTs), a visual JSXGraph builder and a live preview that renders questions the way Moodle does — without having to round-trip through a Moodle instance for every change.

Built with Next.js, React, CodeMirror 6, MathJax 3, JSXGraph and MathLive. The user interface is available in **German, English, French, Spanish, Italian and Slovak**.

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Users, sharing and storage](#users-sharing-and-storage)
- [Deployment with Docker](#deployment-with-docker)
- [Limitations of the local preview](#limitations-of-the-local-preview)
- [Development](#development)
- [Project structure](#project-structure)
- [License](#license)

## Features

### Editing

- **Moodle XML import and export** — open questions from the database, upload files or drag and drop them in. Files containing several questions are supported, and unknown XML elements are preserved unchanged on save.
- **Maxima editor** for question variables, feedback variables, model answers and PRT nodes:
  - autocompletion for about 150 STACK and Maxima functions and for your own variables (showing their current values),
  - hover documentation with signature, description, return value and example,
  - signature help that highlights the active parameter while typing,
  - linting for syntax errors, evaluation errors and missing semicolons.
- **CASText editor** for question text and feedback, in HTML or plain-text mode. Highlights `{@…@}`, `{#…#}`, `[[input:…]]` and blocks; auto-closes `{@` / `{#`; completes placeholders, blocks (`[[if]]`, `[[jsxgraph]]`, …) and LaTeX. A toolbar inserts placeholders and formulas (with a MathLive formula editor).
- **Editors for inputs, PRTs, options, question tests and variants.** Renaming an input or PRT updates every reference to it.
- **Function reference** with search, categories, answer tests and CASText blocks. *Insert* puts the entry into the editor you used last.

### Potential response trees

- An **overview** shows which part of the question and which input is evaluated by which PRT, in question-text order. Inputs without a PRT and PRTs without an input are flagged.
- Each PRT is drawn as a **tree** with true/false branches, back references and leaf nodes including scores. Clicking a node opens its settings.
- SAns and TAns fields offer **pick lists** of inputs, model answers, question variables (with current values) and feedback variables; free text is still allowed.

### JSXGraph builder

- Opened from the *Graph* button in the question-text toolbar, with a live preview.
- Configure the board (size, x/y range, axes, grid, aspect ratio) and add points, sliders, function graphs, segments/lines/arrows and text. Values and terms use Maxima notation (`a*(x-1)^2`, `sqrt(x)`) and may reference slider names, point coordinates (`A_x`) and `{#var#}`.
- Points and sliders can be **bound to inputs** — the builder adds the `input-ref-…` attributes and `stack_jxg.bind_*` calls (using `bind_list_of` for several objects on one input) and can create the input field for you, optionally hidden.
- Elements can be **dragged in the preview** and the new values are written back.
- Existing graphs — including hand-written ones — are **parsed back into the form**. Anything the builder does not recognise is kept verbatim as a *custom code* element.

### Live preview

- Moodle-style rendering with MathJax 3 and JSXGraph, including `stack_jxg.bind_*`.
- Switch between random variants via the seed.
- Live input validation, *Check* evaluates all PRTs and shows the score, *Fill in model answer* fills every input.
- Tabs for a variable table, a list of problems and the question tests.
- Calculations run on a built-in TypeScript implementation of Maxima, or optionally on a real **Maxima server** (see below).

### Workspace

- **Dashboard** with recently edited questions, categories (create, rename, delete), per-category *New question* and *Upload XML*, and search across file and question names.
- **Save without prompts:** `Ctrl+S` names new questions after their title and numbers duplicates (`-2`, `-3`) instead of overwriting. *Save as …* creates a copy.
- **Version history:** the last 20 revisions of every file are kept.
- **Conflict detection:** if someone else saved the file in the meantime, the editor asks before overwriting.

### Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save and download the XML file |
| `Ctrl+Space` | Open autocompletion |

## Quick start

Requirements: **Node.js 22** or later.

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>. On first launch the login page lets you create the first account, which becomes the administrator.

`npm install` copies MathJax and JSXGraph into `public/vendor`, so the preview also works offline. Without further configuration, data is stored in a local SQLite file (`data/stack-editor.db`).

## Configuration

Settings are read from environment variables, or from `.env` / `.env.local`. Copy [`.env.example`](.env.example) as a starting point.

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. If unset, SQLite is used. |
| `STACK_DATA_DIR` | Directory of the SQLite database (default `./data`). |
| `STACK_XML_DIR` | Directory of legacy XML files imported on first start (default `./xml`). |
| `POSTGRES_PASSWORD` | Docker Compose only: password of the internal PostgreSQL user. Must be set **before the first start**. |
| `ADMIN_USER`, `ADMIN_PASSWORD` | Create the first administrator automatically at startup. |
| `MAXIMA_URL` | URL of a goemaxima / MaximaPool server (for goemaxima it ends in `/goemaxima`). Empty = local preview only. |
| `MAXIMA_TIMEOUT` | Request timeout in milliseconds (default `10000`). |
| `MAXIMA_VERSION` | STACK version reported to the Maxima server, e.g. `2024012900`. |

### Maxima server (optional)

The local preview cannot evaluate everything (e.g. `solve`, `factor`, `limit`). For those cases you can connect the same kind of Maxima server STACK itself uses ([goemaxima](https://github.com/mathinstitut/goemaxima) or MaximaPool):

```bash
MAXIMA_URL=https://your-maxima-host/goemaxima
```

- The preview toolbar offers **Automatic** (use Maxima only when the local engine cannot handle something), **Always Maxima** and **Local only**. A badge shows which engine produced the current result.
- With Maxima, question variables are evaluated with `stack_randseed(seed)`, so random values match those in Moodle. `{@…@}` is rendered from Maxima's LaTeX output (`tex1`), and errors are listed per statement under *Problems*.
- Answer tests and input validation still run locally, but on the values computed by Maxima.
- If the server is unreachable, the editor falls back to the local preview and tells you why.
- Requests are proxied through the app (`/api/maxima`, authenticated users only); the Maxima server's address is never exposed to the browser.

## Users, sharing and storage

- **Database:** PostgreSQL when `DATABASE_URL` is set (automatic with Docker Compose), otherwise SQLite. Both use the same queries. When the app starts with an *empty* PostgreSQL database and finds an existing `stack-editor.db`, it migrates users, categories, questions and versions once; the SQLite file is left untouched.
- **Accounts:** administrators create further users in *User management* (user menu, top right), reset passwords and edit optional first and last names. Every user can change their own password. Deleting a user also deletes their questions, categories and shares.
- **Private workspaces:** every user sees only their own questions and categories plus those shared with them. This applies to administrators too — their extra rights are limited to user management.
- **Sharing:** the owner shares a question with selected users as *Read* (view and download) or *Edit* (change content, but not rename, move, delete or re-share). Shared questions appear under *Shared with me*.
- **Legacy XML files:** when the database is first created, all `*.xml` files in `xml/` (or `STACK_XML_DIR`) are imported once into the category *Imported*.

> **Upgrade note:** on the first start after upgrading from a single-user version, all existing questions and categories are assigned to the administrator with the lowest ID. Other users see an empty dashboard until that administrator shares questions with them.

**Backup (SQLite):** copy the `data/` directory, ideally while the app is stopped. For PostgreSQL see below.

## Deployment with Docker

[`docker-compose.yml`](docker-compose.yml) starts two containers:

- **`db`** — PostgreSQL 17. It publishes **no ports** and sits only on the internal `backend` network, reachable solely by the app container. Data lives in the Docker volume `pgdata`.
- **`stack-editor`** — the app (Next.js standalone server, Node 22, Alpine) on port 3000. It waits until the database is healthy.

```bash
docker compose up -d --build
```

To change the port, edit `ports` in `docker-compose.yml`, e.g. `"8090:3000"`. Settings such as `MAXIMA_URL` and `POSTGRES_PASSWORD` go into a `.env` file next to `docker-compose.yml`. The default database password is `stack-editor`; since the database is not reachable from outside this is acceptable, but you can set your own before the first start (PostgreSQL only applies it when the database is created).

**Backup and restore (PostgreSQL):**

```bash
docker exec stack-editor-db pg_dump -U stack stack_editor > stack-editor-backup.sql
```

```bash
docker exec -i stack-editor-db psql -U stack stack_editor < stack-editor-backup.sql
```

The mounted `data/` and `xml/` folders are only used on first start, to migrate an older SQLite database or import XML files.

### Synology Container Manager

1. Build the upload package: `npm run package:synology`. This produces `dist/stack-editor-synology.tar.gz` (or use the folder `dist/stack-editor` directly). The package takes `MAXIMA_URL` from your local `.env.local`.
2. Upload and extract it in **File Station**, e.g. to `/docker/stack-editor`.
3. In **Container Manager**: *Project* → *Create*, name `stack-editor`, path `/docker/stack-editor`, use the existing `docker-compose.yml`. The first build takes a few minutes.
4. Open `http://<NAS-IP>:3000` and create the first administrator account.

**Permissions:** the app container runs as user `node` (UID 1000) and needs to read `data/` and `xml/`. If it cannot, either grant *Everyone* read/write access to `data` in File Station, or enable the `user: "UID:GID"` line in `docker-compose.yml` with your Synology user's IDs (`id <username>` via SSH, typically `1026:100`).

After updating the files, rebuild the project in Container Manager.

## Limitations of the local preview

Without a Maxima server, the preview uses its own TypeScript re-implementation of Maxima ([`lib/maxima`](lib/maxima)) rather than the real CAS:

- It covers the functions commonly used in STACK questions: `rand*`, lists and sets, `if` / `block` / `makelist`, `diff`, `expand`, `subst`, `ev`, simple `integrate`, strings and MCQ helpers. Functions such as `solve`, `factor` and `limit` are not evaluated; a notice is shown instead.
- Answer tests are approximated — `AlgEquiv`, for instance, compares numerically at sample points.
- The random number generator differs from Maxima's, so a given seed yields different values than in Moodle.

Moodle remains the reference; the preview is meant for fast iteration. Connecting a Maxima server removes the first and last limitation for question variables and `{@…@}`.

## Development

```bash
npm test           # engine, XML round-trip, preview, i18n and database tests (SQLite and embedded PostgreSQL)
npm run typecheck  # TypeScript type check
npm run build      # production build
```

Tests use the built-in `node:test` runner. Translations live in [`lib/i18n/messages`](lib/i18n/messages); a test scans the source for untranslated German strings, and another ensures the exported XML is byte-identical regardless of the UI language. Terminology is collected in [`docs/i18n-glossar.md`](docs/i18n-glossar.md).

## Project structure

```
app/            Next.js App Router: / (dashboard), /editor, /login, API routes under /api/*
components/     UI: dashboard, login, user menu, editor app, preview, reference, sections, CodeMirror wrappers
lib/server/     database (PostgreSQL/SQLite), data access, password hashing, sessions, Maxima proxy
lib/client/     fetch helpers for the API
lib/maxima/     Maxima parser, simplifier, evaluator, LaTeX/text output
lib/stack/      XML model, CASText renderer, answer tests, preview, PRT graph, JSXGraph builder, function docs
lib/editor/     CodeMirror extensions (languages, completion, hover, lint, formula editor)
lib/i18n/       locales, message catalogues, translation helpers
scripts/        vendor copy (postinstall) and Synology packaging
tests/          node:test test suites
data/           local SQLite database (not in Git)
xml/            legacy XML questions (imported on first start)
```

## License

Copyright (c) 2026 Thomas Bock.

This project is released under the [PolyForm Noncommercial License 1.0.0](LICENSE). The source code is public: you may use, study, modify and share it for any **noncommercial** purpose. That includes personal use, research, teaching, and use by schools, universities, public research institutions, charities and government bodies.

You may **not** use the software, or forks or modified versions of it, for commercial purposes. That includes selling it, offering it as a paid or commercial hosted service, or bundling it into a commercial product. Anyone you share a copy or fork with must receive the license terms and the `Required Notice` line from [LICENSE](LICENSE).

If you are interested in commercial use, please get in touch to discuss a separate license.

Third-party libraries (Next.js, React, CodeMirror, MathJax, JSXGraph, MathLive and others) remain under their own licenses.
