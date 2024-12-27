import { Condition, isListCondition, isValueCondition } from "../prepareQuery";

export default function isConditionComplete(condition: Condition): boolean {
  if (isListCondition(condition)) {
    return Boolean(
      condition.column && condition.operator && condition.values.length >= 1
    );
  }
  if (isValueCondition(condition)) {
    return Boolean(condition.column && condition.operator && condition.value);
  }
  return condition.conditions.every(isConditionComplete);
}
