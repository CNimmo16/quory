import { GenericDataType } from "@quory/core";
import { isValid, parseISO } from "date-fns";

export default function renderDataValue(
  value: string | number | Date | null,
  columnType: GenericDataType
): string {
  if (value === null) {
    return "NULL";
  }
  if (typeof value === "undefined") {
    return "unselected";
  }
  if (value instanceof Date) {
    return `${value.toDateString()}`;
  }
  if (columnType === "datetime") {
    const parsedDate = parseISO(value.toString());
    const isValidDate = isValid(parsedDate);
    if (isValidDate) {
      return `${parsedDate.toDateString()}`;
    }
  }
  return value.toString();
}
