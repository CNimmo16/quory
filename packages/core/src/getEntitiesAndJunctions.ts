import { snakeCase } from "lodash-es";
import plural from "pluralize";
import { DatabaseSchema } from ".";

const getRef = (table: { schemaName: string; name: string }) =>
  `${table.schemaName}.${table.name}`;

export default function getEntitiesAndJunctions(
  schemaRelationships: DatabaseSchema[]
) {
  const allTables = schemaRelationships.flatMap((schema) =>
    schema.tables.map((table) => ({
      ...table,
      schemaName: schema.name,
    }))
  );

  const junctions = allTables
    .filter((table) => {
      const columnsWithForeignKeys = table.columns.filter((column) => {
        const foreignKeysPointingAtOtherTables = column.foreignKeys.filter(
          (foreignKey) =>
            !(
              foreignKey.foreignSchemaName === table.schemaName &&
              foreignKey.foreignTableName === table.name
            )
        );
        return foreignKeysPointingAtOtherTables.length > 0;
      });

      if (columnsWithForeignKeys.length < 2) {
        return false;
      }

      const tableNameResemblesJunction = columnsWithForeignKeys.every(
        (column) => {
          const [assumedEntityName] = snakeCase(column.name).split("_");

          return (
            assumedEntityName &&
            (table.name.includes(assumedEntityName) ||
              table.name.includes(plural(assumedEntityName)))
          );
        }
      );

      return tableNameResemblesJunction;
    })
    .map(getRef);

  return {
    junctions,
    entities: allTables.map(getRef).filter((ref) => !junctions.includes(ref)),
  };
}
