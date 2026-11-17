# Changelog

## Unreleased

### Added
- Jobs list: server-side pagination, filters by status and process (also reachable from the
  processes page), search, auto-refresh, status chips, durations, bulk delete, query string
  state (`/jobs?processID=...&status=...`).
- Job page: timeline, live progress, results panel (values, references, image preview, GeoJSON
  and bounding boxes on a map), inline logs, links list, raw documents, dismiss/delete.
- Deploy dialog: paste or URL modes (`application/ogcapppkg+json` with `executionUnit.href`),
  identifier auto-detection and local CWL validation, replace an existing process (`PUT`),
  server error details on failures.
- Process page: execution modes limited to what the process supports, *Open the job page*,
  *Copy as curl*, error details from the server.
- Home: capabilities badges built from the conformance classes.
- Dark mode, user name in the header, error page (404/500), landing JSON page without login.
- Unit tests for the job, error and CWL helpers; documentation (`README.md`, `docs/`).
- Swagger page: the OpenAPI document is bundled server side (`/api/openapi`, json-schema-ref-parser)
  so that the external OGC schema files it references (CQL2 filters of collection values in
  particular) resolve correctly instead of producing resolver errors. New optional variable
  `NUXT_ZOO_INTERNAL_BASEURL` for the kernel address as seen by the UI container.
- Swagger page: the resolver errors of the OpenAPI document (external `$ref` documents that
  reference their own `#/definitions`) are shown in a compact, collapsible banner instead of
  Swagger UI's panel; version pills restyled; dark theme.
- Theme: follows the system setting by default, `?theme=dark|light` forces and remembers a
  theme, dark variants for every surface (tables, dialogs, help texts, CWL preview).

### Fixed
- Header tabs triggered a full page reload on every click (`href` instead of router links), so
  the header disappeared and the landing links were fetched again at each navigation. They are
  now in-app links, and a yellow progress bar (brand colour, both themes) shows route changes
  and API calls in progress. Full page loads no longer flash white in dark mode: the document
  background is painted in the right theme before the application styles load.
- Expired sessions: when the access token expired and could not be refreshed (SSO session
  over), the UI kept sending the dead token and every call failed with `401 Invalid JWT token`.
  The server now drops the tokens and flags the session; the client falls back to anonymous
  mode, shows a *Session expired* notice with a sign-in action, and a `401` received with a
  token triggers one retry without it.
- Jobs pages refused to load without a bearer token even when the server accepts anonymous
  calls (`ZOO_OGCAPI_REQUIRES_BEARER_TOKEN=false`).
- Job page polling never stopped on `successful` jobs (it compared with `succeeded`).
- Process page: dismissed jobs are removed by the server (no more `canceled` state and 404 on
  the following poll); every terminal status stops the polling.
- Processes page: file preview used an undefined variable; a demo workflow was fetched on
  every CWL preview.
- The auth handler crashed at startup when the OIDC variables were missing; it now disables
  login instead. Redirects after login only go to same-origin URLs.
- French locale name (`Français`).
