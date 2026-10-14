# SCRUM-97 curiosity report

These are factual investigation notes from the implementation session, not the
developer's personal reflections or the professor's standardized transcript.
The team approved the foundation. The developer's personal reflections have not
been supplied and are not invented here.

| Question explored | Evidence or experiment | Finding and implementation decision |
|---|---|---|
| Can the worker be separated by simply moving its current module? | Read the processing service, models, dispatch, and approved architecture contract. | It accesses application Document/Chunk models and private shared storage. Created an independent foundation without copying those dependencies or switching dispatch. |
| Does another service require another PostgreSQL server? | Contract review and disposable PostgreSQL integration checks. | A separate logical database/role on the existing server supports independent migrations. Verified the service role lacks administrator privileges and cannot select from an application-owned table. |
| How can setup work with an existing volume? | Inspected the first-start initialization SQL; ran the new explicit provisioner twice with an application sentinel row. | Use a one-shot provisioning job rather than relying on first-start initialization. The second run retained the sentinel; ownership/management-marker checks prevent taking over unrelated names. |
| What should the execution model enforce before worker implementation? | PostgreSQL tests for duplicate jobs, multiple runs of one document, invalid records, and schema introspection. | A unique application Job identifier prevents duplicate execution rows; document identifiers remain plain integers. The schema has no application tables or foreign keys. This does not implement concurrency claims or callback idempotency. |
| Should a health response imply PDF processing is functional? | Mocked dependency failures plus stopping actual Redis in the isolated stack. | Separate liveness from readiness. Liveness stayed 200; readiness became 503. Neither claims that the future worker or callback pipeline is integrated. |
| Does execution state survive an HTTP service restart? | Created an execution, restarted the service container, and queried the same job. | The execution persisted in PostgreSQL. This verifies persistence, not recovery of a running processing task. |
| Did the foundation alter existing application behavior? | Full backend regression runner against disposable PostgreSQL and fake AI. | 219 tests and 36 subtests passed; application source and the original Compose file were not changed. No browser or live-AI verification was performed. |

Reference material consulted: the repository architecture contract and source,
[Django's Gunicorn deployment guidance](https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/gunicorn/),
[Gunicorn 26.2.0 release metadata](https://pypi.org/project/gunicorn/26.2.0/),
[PostgreSQL psql documentation](https://www.postgresql.org/docs/16/app-psql.html),
and [Compose profile documentation](https://docs.docker.com/compose/how-tos/profiles/).
An explicit Compose overlay was selected to make the foundation opt-in without
changing the original service definitions.

Remaining uncertainties are the agreed task/wire schema, internal authentication,
claim/retry/result-delivery policy, Django integration ownership, and SCRUM-106
compatibility. They were not resolved or attributed to teammates by this task.
