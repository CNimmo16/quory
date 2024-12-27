import { Condition, isBooleanCondition } from "../prepareQuery";
import isConditionComplete from "./isConditionComplete";

export default function parseToCompleteCondition(
  condition: Condition
): Condition | null {
  if (isBooleanCondition(condition)) {
    const completeConditions = condition.conditions.filter(isConditionComplete);
    if (completeConditions.length === 0) {
      return null;
    }
    return {
      ...condition,
      conditions: completeConditions,
    };
  }
  return isConditionComplete(condition) ? condition : null;
}
