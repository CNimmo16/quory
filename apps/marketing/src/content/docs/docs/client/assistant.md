---
title: "Use the query assistant"
description: "Configure an optional model provider and build relationship queries with natural language."
sidebar:
  order: 5
---

The assistant turns a description of the records you want into a saved relationship query. Manual queries work without an AI key.

## Configure a provider

For local development, copy the repository's `.env.example` to `.env.local` and set `AI_PROVIDER`, `AI_MODEL`, and the matching key. Use a model that supports tool calling. `AI_MODEL` is the provider's model ID without a provider prefix.

| `AI_PROVIDER` | Key variable                            |
| ------------- | --------------------------------------- |
| `openai`      | `OPENAI_API_KEY` (or `OPEN_AI_API_KEY`) |
| `anthropic`   | `ANTHROPIC_API_KEY`                     |
| `google`      | `GOOGLE_GENERATIVE_AI_API_KEY`          |

Packaged apps read these settings from the process environment. Development loads the root `.env.local` without overriding existing environment variables. Restart Electron after changing the configuration.

## Describe the question

Select a project and connection, then describe the base records, related information, filters, and sorting you want. For example:

> Find the customer with email alex@example.com and show their orders, newest first. Include the customer email, order ID, and order date.

Answer any clarification in the chat. Once the query is saved, use the same conversation to amend it. Unsaved manual edits are included in the next chat amendment.

The tool validates its proposed query against the schema and compiles it with the query engine before saving. Review the resulting tables and filters to check they answer your question.

## Understand what is sent

The provider receives the database schema, conversation, and current query, including filter values. It does not receive result rows or database connection credentials. API keys remain in Electron's main process.

Only enable a provider appropriate for the data in your schema and query filters. Assistant updates save the query and conversation automatically; clarification before an update stays in memory.

The assistant supports the relationship builder's read queries. Use the [SQL workspace](/docs/client/sql/) for custom SQL.
