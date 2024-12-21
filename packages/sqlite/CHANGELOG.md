# @quory/sqlite

## 0.2.1

### Patch Changes

- a6234e0: Use affinity to get data types for sqlite

## 0.2.0

### Minor Changes

- c95bfe9: - Support multiple foreign tables in fetchRelatedRows (this is a large breaking change!)
  - Remove unnecessary dependency on Knex.js from Postgres and MySQL drivers (move to dev dependency)
  - Introduce new SQLite driver!
