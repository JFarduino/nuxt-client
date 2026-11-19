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
- Process page: optional inputs left disabled (bounding box defaults, `pause`...) were sent
  anyway. Outputs can now be selected (*Request this output*) and follow the matching optional
  input by default, so that `echo`-like services are not asked for empty outputs.
- Process page: synchronous executions asked for every output and got a `multipart/related`
  body back (which ZOO-Project sends without CORS headers); the UI now requests a JSON
  `response: document`. The subscriber block was sent twice (`subscriber` and
  `executionOptions.subscriber`), which leaves ZOO-Project CWL jobs stuck in `running`; only the
  standard block is sent.
- Process page: a WebSocket message about another job was taken as a successful completion, and
  a progress message set the status to `running...`, hiding the *Dismiss* button. Polling,
  dismiss and delete now go through the API client (bearer token, expired sessions, loading bar),
  polling stops before a dismiss, *Delete job* no longer shows after a failed submission,
  network errors (CORS, server down) are explained, an unknown process identifier shows an error
  instead of an endless spinner, hard-coded English messages and debug logs are gone, and the
  JSON-LD URL uses the current origin.
- Jobs list: the server lists jobs oldest first and has no sort parameter, so the newest job
  landed on the last page; the first page now shows the latest jobs.
- Job page: the results panel of a failed job showed the exception document as if it were
  outputs.
- Dark mode was lost on every full page load: the cookie value was compared as the string `"1"`
  while Nuxt's `useCookie` decodes it into the number `1`, and Quasar reset the theme after
  hydration. The preference is now read with a tolerant helper (`composables/utils/theme.ts`)
  and chosen before Quasar is installed (`plugins/00.quasar-theme.ts`), so the server markup
  and the client agree.
- Quasar's language pack follows the UI locale (table pagination and dialog buttons stayed in
  English).
- Processes list: a loading state instead of *No process matches your search* while loading, a
  plain file picker instead of the uploader (no meaningless upload progress), the OpenAPI
  document was requested twice on page load, and *Authenticate* goes straight to the identity
  provider instead of the generic sign-in page.

- Process page: asynchronous runs no longer ask for `return=representation` (ZOO-Project's
  worker crashes after a successful CWL job when the full response document is requested, and
  the job stays in `running`); *Copy as curl* leaves out the UI's own `subscriber` block; the
  *Enable* checkboxes, the notification endpoints block, *Format* and *Transmission* are
  translated.
- Job page: the STAC `FeatureCollection` returned by CWL jobs is shown as one geographic result
  (map, list of the items' assets) instead of raw `type` / `features` / `id` entries, and the map
  now initialises after a full page load (the container is rendered after `onMounted`).
- Jobs list: rows deleted in bulk disappear immediately instead of lingering until the next
  refresh.
- Job page: the `Multipart/Related` document that ZOO-Project returns for the results of a
  multi-output job run in "raw" mode is split into one entry per output (value, link to the
  referenced file, bounding box on the map) instead of being shown as one raw text value.
- Process page: the input widgets (URL / inline value, content format, value, CRS) are
  translated.
- Layout: the alternative *Quasar* layout no longer reserves 600 px for two empty side drawers
  (tables were squeezed into one-letter columns); on phones the header tabs scroll on one line
  instead of wrapping and clipping the last tab.
- Job page: on phones the header actions no longer overlap the job identifier.

### Documentation
- `docs/known-issues.md`: server-side problems found while testing the UI end to end, with
  reproductions, so they can be reported to ZOO-Project.
