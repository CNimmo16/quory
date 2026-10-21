# @quory/client

## 1.0.10

### Patch Changes

- bddc743: Add PostHog error tracking and masked session replay to the desktop client, with release sourcemap uploads.

## 1.0.9

### Patch Changes

- 479d978: Fix desktop packaging on Windows, Linux, and Apple Silicon Macs, including optional native module handling and cross-platform build commands.

## 1.0.8

### Patch Changes

- df9024a: Use the Quory icon across desktop platforms and adopt Apple's native Icon Composer format on macOS, with an automatically generated fallback for older systems.

## 1.0.7

### Patch Changes

- 187ac8b: Preserve foreign key constraint identity and ordered column pairs, compile complete composite joins, reject ambiguous table relationships consistently, and decode repeated table selections using join-instance aliases.

  Extend `via` with normalized table objects and optional directional column selectors or constraint IDs. Preserve string routes and allow either column name alone when unambiguous.

  Combine relationship planning with shared query validation, dialect-aware identifier quoting, and bound query parameters. Custom drivers must declare their SQL dialect and support parameter bindings; direct compiler consumers must execute the returned SQL together with its parameters.

- 8333d46: Package explicit Apple Silicon and Intel Mac builds alongside Windows and Linux installers. Use certificate-free ad-hoc signatures on macOS and publish checksummed download metadata only after every platform passes its packaged runtime check.
- Updated dependencies [187ac8b]
  - @quory/sqlite@1.0.1

## 1.0.6

### Patch Changes

- 62cc614: Add react devtools in devonly
- 4474714: Add manual save button to query client, add areQueriesEqual util function to core

## 1.0.5

### Patch Changes

- 8e105d4: Performance improvements

## 1.0.4

### Patch Changes

- 7dece22: hopefully the last test!

## 1.0.3

### Patch Changes

- 263b033: test again

## 1.0.2

### Patch Changes

- 8ef9530: another test release

## 1.0.1

### Patch Changes

- a41b463: Test release for github workflow

## 1.0.0

### Major Changes

- 42043db: First release of the Quory electron client!

  This also includes major changes to all packages, including core and its drivers, as well as the introduction of the new @quory/stack package for building full-stack applications with Quory
