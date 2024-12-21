export default function getAffinityForType(type: string) {
  // from https://www.sqlite.org/datatype3.html
  type = type.toUpperCase();

  // If the declared type contains the string "INT" then it is assigned INTEGER affinity.
  if (type.includes("INT")) {
    return "INTEGER";
  }

  // If the declared type of the column contains any of the strings "CHAR", "CLOB", or "TEXT" then that column has TEXT affinity. Notice that the type VARCHAR contains the string "CHAR" and is thus assigned TEXT affinity.
  if (type.includes("CHAR") || type.includes("CLOB") || type.includes("TEXT")) {
    return "TEXT";
  }

  // If the declared type for a column contains the string "BLOB" or if no type is specified then the column has affinity BLOB.
  if (type.includes("BLOB") || !type) {
    return "BLOB";
  }

  // If the declared type for a column contains any of the strings "REAL", "FLOA", or "DOUB" then the column has REAL affinity.
  if (type.includes("REAL") || type.includes("FLOA") || type.includes("DOUB")) {
    return "REAL";
  }

  // Otherwise, the affinity is NUMERIC.
  return "NUMERIC";
}
