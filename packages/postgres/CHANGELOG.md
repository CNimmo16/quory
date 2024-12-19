# @quory/postgres

## 1.0.5

### Patch Changes

- c95bfe9: - Support multiple foreign tables in fetchRelatedRows (this is a large breaking change!)
  - Remove unnecessary dependency on Knex.js from Postgres and MySQL drivers (move to dev dependency)
  - Introduce new SQLite driver!

## 1.0.4

### Patch Changes

- 524e121: ## Fix fetchRelatedRows naming colisions in return

  This changes the return type of fetchRelatedRows from `{ ...allRowData }[]` to `{ localTableData: ..., foreignTableData: ..., otherTables: [...] }[]`

## 1.0.3

### Patch Changes

- 0f5f245: ## Fix fetchRelatedRows naming colisions in return

  This changes the return type of fetchRelatedRows from `{ ...allRowData }[]` to `{ localTableData: ..., foreignTableData: ..., otherTables: [...] }[]`

## 1.0.2

### Patch Changes

- 331de24: make @types/pg a non-dev dependency

## 1.0.1

### Patch Changes

- 0e74bfe: Add missing @types/pg

## 1.0.0

### Major Changes

- b4e8ac5: rename driver

## 0.1.1

### Patch Changes

- 993f465: Fix dist not included in published package
