---
title: "Explore related records"
description: "Build a focused relationship query, save it, and reuse named filtersets."
sidebar:
  order: 3
---

A good investigation starts with one known record. For example: find a customer by email, then inspect the orders and products associated with that customer.

## Build the query in small steps

1. Select a project and database connection, then start a manual relationship query.
2. Choose the base table, such as customers.
3. Select the columns you need to recognise the record.
4. Add a filter for a known ID or email.
5. Add a related table and choose the columns to display from it.
6. Check the results before adding another relationship.

Quory uses the database's declared foreign keys to find a path between tables. If an expected table is missing from the relationships, check the constraints in your database. Similar column names alone are not enough.

## Interpret joined rows

A customer can repeat when several orders match. Adding a table uses an inner join, so records without a matching related row disappear. A page of results is a page of joined rows, and a count describes those rows rather than distinct base records.

Use filters and a narrow column selection to keep results useful. If multiple relationships connect the same tables, the engine may ask for a more specific path. The current visual builder does not have a dedicated constraint picker; an explicit query definition can use the [core path selectors](/docs/core/relationships/).

## Save an investigation

Save the relationship query and give it a name that describes the question it answers. Reopen it from the project's query list to run it again. In a folder project, the definition is written under `.quory/queries/` and can be reviewed in Git.

Saved queries belong to a project, so you can reuse them on another connection with a compatible schema.

## Reuse named filtersets

For recurring investigations, keep the same columns and relationships and change only the filters:

1. Open a saved relationship query and set its filters.
2. Choose **Save current filters** in the Filters header.
3. Give the filterset a name.
4. Choose a saved filterset to replace the current filters.

Recent filtersets appear in a row; **View more** shows the rest. Applying one returns to the first results page while preserving columns, joins, and ordering. It is a normal query edit and can be undone.

Filtersets are scoped to a project and query. They stay in the local app database, even for folder projects; saving one does not change the `.quory` query definition. If the query's tables or join paths change, restore the matching relationship tree before applying an older filterset.
