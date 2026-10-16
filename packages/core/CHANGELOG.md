# @quory/core

## 7.0.0

### Major Changes

- 187ac8b: Preserve foreign key constraint identity and ordered column pairs, compile complete composite joins, reject ambiguous table relationships consistently, and decode repeated table selections using join-instance aliases.

  Extend `via` with normalized table objects and optional directional column selectors or constraint IDs. Preserve string routes and allow either column name alone when unambiguous.

  Combine relationship planning with shared query validation, dialect-aware identifier quoting, and bound query parameters. Custom drivers must declare their SQL dialect and support parameter bindings; direct compiler consumers must execute the returned SQL together with its parameters.

## 6.1.0

### Minor Changes

- 4474714: Add manual save button to query client, add areQueriesEqual util function to core

## 6.0.0

### Major Changes

- 42043db: First release of the Quory electron client!

  This also includes major changes to all packages, including core and its drivers, as well as the introduction of the new @quory/stack package for building full-stack applications with Quory

### Patch Changes

- 046799a: Add group by to primary keys in base table

## 5.1.1

### Patch Changes

- 942510d: allow specifying base table in joins

## 5.1.0

### Minor Changes

- 764018b: Allow passing the same table twice in fetchRelatedRows "joins" argument

## 5.0.0

### Major Changes

- c95bfe9: - Support multiple foreign tables in fetchRelatedRows (this is a large breaking change!)
  - Remove unnecessary dependency on Knex.js from Postgres and MySQL drivers (move to dev dependency)
  - Introduce new SQLite driver!

### Patch Changes

- 9490eda: Remove rogue console log

## 4.0.0

### Major Changes

- 1ca4abc: - Support and/or in fetchRelatedRows where condition
  - Add "via" prop for fetchRelatedRows to specify join path
  - Return entire table in getRelationsForTable

## 3.0.0

### Major Changes

- 524e121: ## Fix fetchRelatedRows naming colisions in return

  This changes the return type of fetchRelatedRows from `{ ...allRowData }[]` to `{ localTableData: ..., foreignTableData: ..., otherTables: [...] }[]`

## 2.0.0

### Major Changes

- 0f5f245: ## Fix fetchRelatedRows naming colisions in return

  This changes the return type of fetchRelatedRows from `{ ...allRowData }[]` to `{ localTableData: ..., foreignTableData: ..., otherTables: [...] }[]`

## 1.1.0

### Minor Changes

- f305a9c: add getRelationsForTable function

## 1.0.2

### Patch Changes

- 993f465: Fix dist not included in published package

## 1.0.1

### Patch Changes

- f6232a4: Remove unused dependency, add keywords

## 1.0.0

### Major Changes

- d24357e: Update function names
