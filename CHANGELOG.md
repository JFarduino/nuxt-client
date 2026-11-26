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
- Processes: the CWL workflow graph is now drawn by [cwl-svg](https://github.com/rabix/cwl-svg)
  (the renderer of the Rabix Composer) through a new `CwlGraph` component: packed `$graph`
  documents are resolved (step `run` references inlined), a single CommandLineTool is drawn as a
  one-step workflow, automatic layout, zoom and pan, movable nodes, port names on hover, a
  details panel for the selected node or link (types, documentation, command, container image,
  ports, connections), light and dark themes in the brand colours, SVG export and full screen.
  It replaces the hand-made scripts of `public/cwl-demo` under the processes list, and the deploy
  dialog now draws the package being deployed while it is typed or after a file is picked.

- Processes list: a click on a row unfolds the process preview right under it instead of at
  the bottom of the page (built-in processes used to open their page). The preview holds the
  workflow graph of the package, the actions (Execute, Jobs, CWL package, and Replace / Delete
  in a menu, which replace the Actions column), the description, execution modes, keywords,
  inputs (type, required or optional, number of values, default value, media types) and
  outputs, and the provenance of the package on one line. **All metadata** shows everything
  the server gives: the process fields, every schema.org metadata entry with all its fields
  (nested organisations, addresses and persons, UTC dates, links to the schema.org terms) and
  the full JSON document. One row is open at a time and the address keeps it
  (`?process=<id>`, opened on its page of the table); a search, sorting or page change that
  hides the open row folds it, and the preview is reloaded when the language changes. A
  process the server lists twice appears once (it used to unfold two or three rows at once).
  Errors are explicit: banner when the full description cannot be loaded, message for the
  package refused to anonymous processes (`406`). The description falls back to the one of
  the package when the server sends none or its message catalogue header, the `None` titles
  the server writes for untitled inputs are hidden, and long descriptions stay on four lines
  in the list. New `components/processes/ProcessPreview.vue`, `MetadataValue.vue` and
  `composables/utils/processMetadata.ts` (unit tested).

### Security
- Dependencies: `npm audit` went from 80 findings (11 critical, 36 high) to 8 moderate ones that
  only Nuxt 4 fixes. Non-breaking updates applied with `npm audit fix` (quasar, vite, rollup,
  vue 3.5.46, js-yaml, markdown-it, nanoid, tar, lodash, axios, unhead, yaml...). Major updates:
  next-auth 4.24.15 (five advisories, among them the OAuth state/nonce/PKCE cookies not bound to
  their provider; `next-auth/core` is aliased in `nuxt.config.ts` because the subpath is no longer
  exported although @sidebase/nuxt-auth 0.9 still imports it), vue3-openlayers 12 (jspdf 4.2.1;
  the stylesheets are now imported by the plugin), @nuxtjs/i18n 10 (vue-i18n 11.4.14),
  nuxt-quasar-ui 3 (its component scan rejects the `*.hydration.fixtures` entries that Quasar
  2.32+ lists and that broke `nuxt build`), happy-dom 21. Removed unused packages: `@nuxt/ui`
  (not in the module list, pulled Tailwind), `@auth/core` (never imported) and `vue-uuid` (uuid
  with no fixed release): the WebSocket channel identifier now comes from
  `composables/utils/ids.ts` (`crypto.randomUUID()` with a `getRandomValues` fallback for plain
  http origins). `minimatch` is forced to 11.0.1+ under swagger-client. `vue` is pinned to a
  version range instead of `latest`.
- Docker image: the runtime stage applies the Debian security updates and drops the npm CLI
  (`npm`, `npx`, `corepack`), whose bundled dependencies (pacote, sigstore, ip-address,
  brace-expansion...) accounted for most of the fixable findings of `docker scout cves`.
  `.output/` is now ignored by git.
- Content-Security-Policy: the UI server sends a `Content-Security-Policy` header whose
  `connect-src` only allows the UI itself, the ZOO-Project API, `websocketd`, the identity
  provider, `epsg.io` and `raw.githubusercontent.com`, so the bearer token can no longer be sent
  to another server by a link of a job (the API client attaches it to any absolute URL). The
  policy comes from `config/csp.json`, read at runtime and reloaded when it changes: replace it
  at deployment time (ConfigMap, bind mount) or point `NUXT_CSP_CONFIG_FILE` to another file.
  Placeholders `{ZOO_API}`, `{ZOO_WS}` and `{OIDC_ISSUER}` follow the UI settings; a report-only
  mode helps to try stricter policies. See `docs/configuration.md`.
- Docker image: `.env` files are no longer sent to the build. `nuxt build` loads them, so an
  image built from a checkout that has one carried its values (`NUXT_AUTH_SECRET` among them) in
  `.output/server/chunks/nitro/nitro.mjs`.

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
- Signed-in users saw *Sign in to view this job.* (or the same notice on the jobs list) once the
  access token expired, usually a few minutes after signing in, while the header still showed
  their name; executions sent at that point were anonymous. The browser read the token once per
  page load and never renewed it, and a reload could hand it the stale one again. It is now
  renewed before it expires and before an API call that would carry an expired one.
- Process page: the *Open the job page* button was shown twice once a job had started; the one
  next to *Execute* remains.
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
- Execution page: the *Show Raw JSON* block of the response stayed light grey in dark mode
  (light text on a light background); every preformatted block now uses the theme's code
  background.

- Landing JSON page (`/ogc-api`): the request sent `f=json`, which the kernel refuses on the
  landing route (`400`), so the page only showed an error; it now relies on the `Accept` header.
- Process page: the number widget emits strings, so numeric literal inputs (`pause: "2"`) were
  sent as JSON strings; they are now sent as numbers when the schema type is `number` or
  `integer`.

- CWL workflow graph: zooming with the wheel also scrolled the page (cwl-svg never cancels the
  wheel event); over the graph the wheel now only zooms. Dragging a node made the canvas pan
  non-stop once the page had been scrolled, so the node raced away: cwl-svg's edge panning
  measures the canvas position only once, when the graph is created. It is now measured again at
  each drag start, and edge panning moves at half its former speed.

- Swagger page, dark mode: the text typed in the parameter fields was invisible. The page switches
  to `color-scheme: dark`, which turns the text of native fields white, Swagger UI paints the
  fields white, and the inversion filter of the dark theme then made both dark. Swagger UI keeps
  the light scheme inside its own block and is inverted as a whole.

### Removed
- Unused code: components that were never rendered (`TopBarMenu`, `TopBarLeftMenu`,
  `TopBarRightMenu`, and `HeaderMenu` since the header rework), `composables/utils/useApiFetch.ts`,
  the root `callback.vue` (not a page, so never routed), the empty `config.*.json` files, unused
  imports, variables and functions in the headers and the process pages, helpers and styles this
  branch no longer uses, and 20 translation keys that no code reads.

### Documentation
- `docs/known-issues.md`: server-side problems found while testing the UI end to end, with
  reproductions, so they can be reported to ZOO-Project.
