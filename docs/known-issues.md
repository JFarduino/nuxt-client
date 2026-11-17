# Known server-side issues

Problems found while exercising every page of the UI against a local ZOO-Project DRU stack
(chart `zoo-project-dru` 0.10.9, kernel 2.1.1-dev, November 2026). They belong to the kernel
or to the CWL runner, not to this client; the UI works around the ones it can. Each entry
gives a reproduction so that it can be reported upstream.

## Jobs

### A CWL job never leaves `running` when the subscriber block is sent twice

**Symptom.** A job of a deployed CWL process reaches `progress: 100`, message
`execution successful`, the stage-out is done and the results file exists, but the `services`
row keeps `fstate = Running`, `end_time` stays empty, the API answers `running` forever and
`GET /jobs/{id}/results` returns `404 ResultNotReady`.

**Trigger.** The execute request carries the subscriber URIs **both** at the top level
(`subscriber`, as in OGC API - Processes) and under `executionOptions.subscriber`. Seven runs
of the same process: both blocks present → stuck (2/2); only one of them, or none → `Succeeded`
(5/5). Built-in Python services (`echo`) are not affected.

```bash
# stuck
curl -X POST $API/processes/hello-jules/execution -H 'Content-Type: application/json' \
  -H 'Prefer: respond-async' -d '{"inputs":{"name":"x"},
  "subscriber":{"successUri":"http://zoo-project-dru-service/cgi-bin/publish.py?jobid=J&type=success",
                "inProgressUri":"http://zoo-project-dru-service/cgi-bin/publish.py?jobid=J&type=inProgress",
                "failedUri":"http://zoo-project-dru-service/cgi-bin/publish.py?jobid=J&type=failed"},
  "executionOptions":{"subscriber":{"successUri":"...","inProgressUri":"...","failedUri":"..."}}}'
```

The forked FPM worker exits without going through `recordResponse` (`zoo_service_loader.c`,
end of `runAsyncRequest`); the callback threads live in `service_callback.c`. The UI now sends
the standard `subscriber` block only.

### A failing CWL tool hides its error behind `KeyError: 'service_logs'`

When the tool exits with a non-zero code the job ends `failed` with a Python traceback instead
of the tool's message: `zoo_template_common/common_execution_handler.py`, line 231,
`self.conf["service_logs"]["length"] = str(cindex)` raises because no `service_logs` section
exists. No log link is published, and the job namespace (`<process>-<jobid>`) with its pods in
`Error` is not cleaned up.

### `GET /jobs/{id}/results` of a failed job answers 200

The body is an exception document (`NoApplicableCode`) but the status code is `200` instead of
an error code. The UI recognises exception documents and shows them as errors.

### The jobs list has no order

`GET /jobs` returns the rows in insertion order (oldest first) and ignores any sort parameter,
so clients paginating from `skip=0` show the oldest jobs first. The UI reads the end of the list
for its first page.

## Execution

### Synchronous responses with several outputs lack the CORS headers

`POST /processes/echo/execution` with `Prefer: respond-sync` and more than one output returns a
`multipart/related` body **without** `Access-Control-Allow-Origin` (the `X-Powered-By` headers
are missing too), so browsers block the response. With a single output, or with
`"response": "document"`, the headers are present. The UI requests `response: document` for
synchronous runs.

### `response: document` fails on empty outputs

Requesting an output whose value is empty (for instance `c` of `echo` when no `c` input was
given) with `"response": "document"` answers `400 InvalidParameterValue — ZOO-Kernel cannot
parse your POST data: None`, although the request is valid; the `raw` response returns `NULL`
for that output. The UI lets the user choose the outputs and, by default, does not request an
output named like a disabled optional input.

### Cosmetic

- Status line `HTTP/1.1 200 OK;` (trailing semicolon) on `response: raw` answers.
- A failing synchronous execution answers `500 Not Implemented` (reason phrase of a different
  status code).
- French kernel message: « Le noyau ZOO-Kernel a exécuter votre service avec succès ! »
  (« a exécuté »).
