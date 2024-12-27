import { PreparedJoinDef } from "@quory/core";

export default function findJoinRecursively(
  join: PreparedJoinDef,
  joinAliasToFind: string,
  parent?: PreparedJoinDef
): { join: PreparedJoinDef; parent: PreparedJoinDef | undefined } | null {
  if (join.joinAlias === joinAliasToFind) {
    return { join, parent };
  }
  for (const childJoin of join.joins) {
    const sourceJoin = findJoinRecursively(childJoin, joinAliasToFind, join);
    if (sourceJoin) {
      return sourceJoin;
    }
  }
  return null;
}
