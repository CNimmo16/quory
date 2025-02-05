# @quory/core

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
