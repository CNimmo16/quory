import {
  DatabaseInspectionDriver,
  GenericDataType,
  Relationship,
  Row,
  TableColumn,
} from "./DatabaseInspectionDriver";

type FakeTableDefinition = {
  name: string;
  schemaName: string;
  columns: {
    [name: string]: {
      genericDataType: GenericDataType;
      isNullable: boolean;
      includedInPrimaryKey: boolean;
      references?: {
        foreignColumn: string;
        foreignTable: string;
        foreignSchema: string;
      };
    };
  };
  data?: Record<string, string>[];
};

export default class FakeDatabaseInspectionDriver
  implements DatabaseInspectionDriver
{
  private tables: FakeTableDefinition[] = [];

  private mockedExecResponse?: Row[];

  defineTables(tables: FakeTableDefinition[]) {
    this.tables = tables;
  }

  mockExecResponse(res: Row[]) {
    this.mockedExecResponse = res;
  }

  async getAllColumnsInDatabase(): Promise<TableColumn[]> {
    return this.tables.flatMap((table) =>
      Object.entries(table.columns).map(
        ([
          columnName,
          { genericDataType, isNullable, includedInPrimaryKey },
        ]) => ({
          name: columnName,
          tableName: table.name,
          schemaName: table.schemaName,
          dataType: genericDataType,
          genericDataType,
          isNullable,
          includedInPrimaryKey,
        })
      )
    );
  }

  async getAllForeignKeysInDatabase(): Promise<Relationship[]> {
    return this.tables.flatMap((table) =>
      Object.entries(table.columns)
        .filter(([, { references }]) => typeof references !== "undefined")
        .map(
          ([
            localColumn,
            {
              // @ts-expect-error references actually is filtered above
              references: { foreignSchema, foreignTable, foreignColumn },
            },
          ]) => ({
            localSchema: table.schemaName,
            localTable: table.name,
            localColumn,
            foreignSchema,
            foreignTable,
            foreignColumn,
          })
        )
    );
  }

  async exec(sql: string): Promise<Row[]> {
    if (!this.mockedExecResponse) {
      throw new Error(
        "Call mockExec() with a value to resolve with before calling exec() on FakeDatabaseInspectionDriver"
      );
    }
    return this.mockedExecResponse;
  }

  async testConnection(): Promise<void> {
    return;
  }
}
