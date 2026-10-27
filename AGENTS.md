# Architecture rules
- Product catalog requests use the linked Neon connector from the query-product Edge Function; never expose connector credentials to the client.
- Product edits are admin-only, validate identifiers and catalog column lengths, and save the master record and aliases in one locked transaction to avoid partial changes.
- Product edit validation lives alongside the Edge Function and is covered by Vitest tests without importing the Deno entrypoint.