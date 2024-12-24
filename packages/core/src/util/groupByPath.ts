export default function groupByPath<T>(
  joinPaths: {
    path: string[];
    item: T;
  }[]
) {
  const ret: {
    items: T[];
    path: string[];
  }[] = [];
  for (const { item, path } of joinPaths) {
    const supersets = joinPaths.filter(({ path: otherPath }) => {
      return path.every((node, i) => otherPath[i] === node);
    });
    const firstSuperset = supersets[0];
    if (firstSuperset) {
      const longestSuperset = supersets.reduce((longest, superset) => {
        return superset.path.length > longest.path.length ? superset : longest;
      }, firstSuperset);
      const inRet = ret.find(
        (r) => r.path.join(",") === longestSuperset.path.join(",")
      );
      if (inRet) {
        inRet.items.push(item);
      } else {
        ret.push({
          path: longestSuperset.path,
          items: [item],
        });
      }
    } else {
      ret.push({
        path,
        items: [item],
      });
    }
  }
  return ret;
}
