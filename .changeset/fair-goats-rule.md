---
"@quory/core": major
"@quory/postgres": patch
---

## Fix fetchRelatedRows naming colisions in return

This changes the return type of fetchRelatedRows from `{ ...allRowData }[]` to `{ localTableData: ..., foreignTableData: ..., otherTables: [...] }[]`
