import {
  Condition,
  isListCondition,
  isValueCondition,
  isNullCondition,
} from "../prepareQuery";

export default function isConditionComplete(condition: Condition): boolean {
  if (isNullCondition(condition)) return Boolean(condition.column);
  if (isListCondition(condition)) {
    return Boolean(
      condition.column && condition.operator && condition.values.length >= 1,
    );
  }
  if (isValueCondition(condition)) {
    return Boolean(condition.column && condition.operator && condition.value);
  }
  return (
    condition.conditions.length > 0 &&
    condition.conditions.every(isConditionComplete)
  );
}
