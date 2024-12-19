export default function dedupeJoinPaths(
  joinPaths: {
    tableRef: string;
    path: string[];
  }[]
) {
  const ret: {
    path: string[];
    tableRefs: string[];
  }[] = [];
  for (const { tableRef, path } of joinPaths) {
    const supersets = joinPaths.filter(({ path: otherPath }) => {
      return path.every((node, i) => otherPath[i] === node);
    });
    if (supersets.length >= 1) {
      const longestSuperset = supersets.reduce((longest, superset) => {
        return superset.path.length > longest.path.length ? superset : longest;
      }, supersets[0]);
      const inRet = ret.find(
        (r) => r.path.join(",") === longestSuperset.path.join(",")
      );
      if (inRet) {
        inRet.tableRefs.push(tableRef);
      } else {
        ret.push({
          path: longestSuperset.path,
          tableRefs: [tableRef],
        });
      }
    } else {
      ret.push({
        path,
        tableRefs: [tableRef],
      });
    }
  }
  return ret;
}
