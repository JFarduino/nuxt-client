# Configuration

Every setting is an environment variable read when the Node server starts (`runtimeConfig`),
so the same image works for any server: changing a value only requires restarting the process
or the pod.

## Server connection

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_ZOO_BASEURL` | — | Root URL of the ZOO-Project server **as seen by the browser**. The UI calls `<NUXT_ZOO_BASEURL>/ogc-api/...`. |
| `NUXT_ZOO_INTERNAL_BASEURL` | `NUXT_ZOO_BASEURL` | Address of the ZOO-Project **as seen by the UI server** (used by `/api/openapi` to fetch the document), e.g. `http://zoo-project-dru-service` inside the cluster. Without it, the public URL is tried first, then the origin of `SUBSCRIBERURL`. |
| `NUXT_WS_URL` | derived from the page URL | WebSocket endpoint of `websocketd` (e.g. `ws://localhost:8888`, `wss://ws.example.org`). Used by asynchronous executions for live progress. |
| `SUBSCRIBERURL` | — | URL of the server's `publish.py` used as `subscriber` in execute requests (e.g. `http://zoo-project-dru-service/cgi-bin/publish.py` inside the cluster). |
| `ZOO_OGCAPI_REQUIRES_BEARER_TOKEN` | `true` | `false` when anonymous calls are accepted: pages load without login. `true` when the API is protected: pages wait for the token (up to 4 s) and show a *sign in* notice. |
| `ZOO_IAM_ENABLED` | `false` | `true` when an IAM gateway (APISIX...) protects the per-user API URLs: Swagger then uses the static base URL. |

The Swagger page loads the OpenAPI document through the UI's own server (`/api/openapi`),
which bundles the external schema files referenced by the ZOO-Project document; the UI
container therefore needs outbound HTTPS access to `schemas.opengis.net` and
`raw.githubusercontent.com` (otherwise the raw document is served and Swagger reports the
unresolved references in a banner).

The ZOO-Project must answer with CORS headers (`cors=true` in `main.cfg`, enabled in the Helm
chart) since the browser calls it directly.

## Content-Security-Policy

The UI server sends a `Content-Security-Policy` header with every response. The default
policy limits the servers the page's JavaScript may contact (`connect-src`): the UI itself, the
ZOO-Project API, `websocketd`, the identity provider, `epsg.io` (projection definitions) and
`raw.githubusercontent.com` (package preview in the deploy dialog). The browser refuses any
other request before sending it, so the user's bearer token cannot leave for another server,
even if a job or a result links to one.

The policy is read from a JSON file at runtime, so it can be changed at deployment time
without rebuilding the image:

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_CSP_CONFIG_FILE` | `config/csp.json` (`/usr/src/app/config/csp.json` in the image) | Policy file. |

Default file (`config/csp.json`):

```json
{
  "enabled": true,
  "reportOnly": false,
  "directives": {
    "connect-src": ["'self'", "{ZOO_API}", "{ZOO_WS}", "{OIDC_ISSUER}", "https://epsg.io", "https://raw.githubusercontent.com"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'self'"]
  }
}
```

- `directives`: one entry per CSP directive. The value is a list of sources, a string of
  sources separated by spaces, `true` for directives without value (`upgrade-insecure-requests`)
  or `false` to leave the directive out. A directive left without any source is sent as `'none'`.
- Placeholders, replaced by the origin (`scheme://host:port`) of the matching variable, and
  dropped when the variable is not set: `{ZOO_API}` (`NUXT_ZOO_BASEURL`), `{ZOO_WS}`
  (`NUXT_WS_URL`, `http(s)` turned into `ws(s)`), `{OIDC_ISSUER}` (`NUXT_OIDC_ISSUER`).
- `reportOnly: true` sends `Content-Security-Policy-Report-Only` instead: the browser reports
  the violations in its console without blocking anything. Use it to try a stricter policy.
- `enabled: false` sends no header.
- Keys starting with `$` (`$comment`) are ignored.

The file is checked for changes every 5 seconds, so an update is applied without restarting
the server. When the file is missing, the policy built into the image (the `config/csp.json`
of the build) applies. When it is invalid, the built-in policy applies too and the server logs
the error (`[csp] ... is invalid`); invalid directives or sources are dropped with a warning.

Add an origin to `connect-src` when the page must call another server: an API served from
another host than `NUXT_ZOO_BASEURL` (OpenAPI `servers` entry), a WebSocket URL derived from the
page host (`NUXT_WS_URL` not set), or the hosts of the packages previewed by URL in the deploy
dialog. A blocked preview is not fatal: the dialog says so and the ZOO-Project server fetches
the package itself when it is deployed.

### Changing the policy with the Helm chart

Create a ConfigMap from your file, then mount it with the chart's `webui.volumes`,
`webui.volumeMounts` and `webui.extraEnv` values:

```bash
kubectl create configmap zoo-webui-csp -n <namespace> --from-file=csp.json=./csp.json
# later updates
kubectl create configmap zoo-webui-csp -n <namespace> --from-file=csp.json=./csp.json \
  --dry-run=client -o yaml | kubectl apply -f -
```

```yaml
webui:
  extraEnv:
    - name: NUXT_CSP_CONFIG_FILE
      value: /etc/zoo-webui/csp.json
  volumes:
    - name: webui-csp
      configMap:
        name: zoo-webui-csp
        optional: true   # without the ConfigMap, the built-in policy applies
  volumeMounts:
    - name: webui-csp
      mountPath: /etc/zoo-webui
      readOnly: true
```

Mount the ConfigMap as a directory, not with `subPath`: Kubernetes only refreshes directory
mounts, and the UI then applies the new policy within about a minute.

With Docker, bind-mount the file over the default one:

```bash
docker run -v "$PWD/csp.json:/usr/src/app/config/csp.json:ro" ... zooproject/nuxt-client
```

## Authentication (OpenID Connect)

| Variable | Description |
|----------|-------------|
| `NUXT_OIDC_ISSUER` | Issuer URL, e.g. `https://auth.example.org/realms/zooproject`. The server side of the UI fetches `<issuer>/.well-known/openid-configuration`; the browser is redirected to the authorization endpoint found there. The issuer must therefore be reachable from both the UI container and the browser under the same URL. |
| `NUXT_OIDC_CLIENT_ID` | Confidential client identifier (default `webapp` in the chart). |
| `NUXT_OIDC_CLIENT_SECRET` | Its secret. |
| `AUTH_ORIGIN` | Public URL of the UI, e.g. `https://webui.example.org` or `http://localhost:3058`. The OIDC redirect URI is `<AUTH_ORIGIN>/api/auth/callback/keycloak`. |
| `NEXTAUTH_URL`, `NUXT_BASE_URL` | Same value as `AUTH_ORIGIN`. |
| `NUXT_AUTH_SECRET` | Random string used to encrypt the session cookie (`openssl rand -base64 32`). |
| `NODE_TLS_REJECT_UNAUTHORIZED` | `0` to accept self-signed certificates on the issuer (development only). |

When the three `NUXT_OIDC_*` variables are not all set, login is disabled: the header shows no
*Authenticate* button and the UI works anonymously.

### Identity provider requirements

- A **confidential** OpenID Connect client (`client_id` / `client_secret`), standard
  (authorization code) flow enabled.
- Valid redirect URI: `<AUTH_ORIGIN>/api/auth/callback/keycloak`; valid post-logout redirect
  URI: `<AUTH_ORIGIN>/*`; web origin: `<AUTH_ORIGIN>`.
- The access token must carry the audience expected by the ZOO-Project (`iam.audience` in the
  chart, `zoo-project-webapp` by default): in Keycloak add an *Audience* mapper to the client.
- The ZOO-Project validates the token signature against `<issuer>/protocol/openid-connect/certs`
  and the `iss` claim against `iam.issuer`: both sides must point to the same issuer URL.

Token lifetimes are those of the identity provider: the UI refreshes the access token server
side with the refresh token, and treats the session as over when the refresh fails. For a
development realm, lifetimes of 1 h (access token) and 12 h (SSO idle) avoid frequent re-logins.

The ZOO-Project repository ships a ready-to-use local Keycloak (`docker/keycloak/start.sh`)
with a realm, the `webapp` client and a test user, wired by the `keycloak` skaffold profile.

## Helm chart mapping

With the `zoo-project-dru` chart (`webui.enabled=true`):

| Chart value | Environment variable(s) |
|-------------|-------------------------|
| `ingress.hosturl` / default `http://localhost:8080` | `NUXT_ZOO_BASEURL` |
| `webui.url` | `AUTH_ORIGIN`, `NEXTAUTH_URL`, `NUXT_BASE_URL` |
| `webui.wsurl` | `NUXT_WS_URL` |
| `webui.oidc.issuer`, `webui.oidc.clientId`, `webui.oidc.clientSecret` | `NUXT_OIDC_ISSUER`, `NUXT_OIDC_CLIENT_ID`, `NUXT_OIDC_CLIENT_SECRET` |
| `webui.authSecret` | `NUXT_AUTH_SECRET` |
| `webui.requiresBearerToken` (string `"true"`/`"false"`) | `ZOO_OGCAPI_REQUIRES_BEARER_TOKEN` |
| `iam.enabled` | `ZOO_IAM_ENABLED` |
| `webui.nodeTlsRejectUnauthorized` | `NODE_TLS_REJECT_UNAUTHORIZED` |
| `webui.extraEnv` / `webui.envFrom` | any additional variable |

Note that the chart's JSON schema requires `webui.requiresBearerToken` to be a **string**:
pass it through a values file rather than `--set` (which turns `false` into a boolean).

## Build-time settings

| Variable | Description |
|----------|-------------|
| `NUXT_APP_BASE_URL` | Base path when the UI is served under a sub path (e.g. `/webui/`). Read at build time. |
| `HOST`, `PORT` (`NITRO_HOST`, `NITRO_PORT`) | Listening address of the Node server (defaults `0.0.0.0:3000` in the image). |
