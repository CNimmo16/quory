# @quory/stack

## 1.0.1

### Patch Changes

- 187ac8b: Preserve foreign key constraint identity and ordered column pairs, compile complete composite joins, reject ambiguous table relationships consistently, and decode repeated table selections using join-instance aliases.

  Extend `via` with normalized table objects and optional directional column selectors or constraint IDs. Preserve string routes and allow either column name alone when unambiguous.

  Combine relationship planning with shared query validation, dialect-aware identifier quoting, and bound query parameters. Custom drivers must declare their SQL dialect and support parameter bindings; direct compiler consumers must execute the returned SQL together with its parameters.

- Updated dependencies [187ac8b]
  - @quory/core@7.0.0
  - @quory/sqlite@1.0.1
  - @quory/mysql@2.0.1
  - @quory/postgres@2.0.1

## 1.0.0

### Major Changes

- 42043db: First release of the Quory electron client!

  This also includes major changes to all packages, including core and its drivers, as well as the introduction of the new @quory/stack package for building full-stack applications with Quory

### Patch Changes

- Updated dependencies [42043db]
- Updated dependencies [046799a]
  - @quory/core@6.0.0
  - @quory/postgres@2.0.0
  - @quory/sqlite@1.0.0
