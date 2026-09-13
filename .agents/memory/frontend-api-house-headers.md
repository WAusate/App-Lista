---
name: Frontend API house headers
description: The generated React Query client exposes OpenAPI header parameters through hook request options.
---

For this app, household-scoped mutations must be created with `request.headers["X-House-Code"]` in the hook options. The generated mutation variables only contain the JSON body/path values, so omitting the request option silently sends no household identity and the API rejects the mutation.

**Why:** The Orval client used here keeps required header parameters in the request-options channel rather than in mutation variables.

**How to apply:** Whenever adding a household-scoped mutation, instantiate its hook with the current house code header and invalidate the household query after success.