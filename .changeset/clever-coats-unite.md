---
"@quory/core": major
"@quory/sqlite": minor
"@quory/postgres": patch
"@quory/mysql": patch
---

- Support multiple foreign tables in fetchRelatedRows (this is a large breaking change!)
- Remove unnecessary dependency on Knex.js from Postgres and MySQL drivers (move to dev dependency)
- Introduce new SQLite driver!
