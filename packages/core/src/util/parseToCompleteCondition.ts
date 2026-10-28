import {
  Condition,
  ConditionOperator,
  isBooleanCondition,
  isValueCondition,
} from "../prepareQuery";
import isConditionComplete from "./isConditionComplete";

/** Removes empty drafts recursively; throws rather than discarding partial filters. */
export default function parseToCompleteCondition(
  condition: Condition,
): Condition | null {
  if (isBooleanCondition(condition)) {
    const completeConditions = condition.conditions
      .map(parseToCompleteCondition)
      .filter((child): child is Condition => child !== null);
    if (completeConditions.length === 0) {
      return null;
    }
    return {
      ...condition,
      conditions: completeConditions,
    };
  }
  if (
    isValueCondition(condition) &&
    condition.operator === ConditionOperator.EQUALS &&
    !condition.column &&
    !condition.value
  )
    return null;
  if (!isConditionComplete(condition)) {
    throw new Error(
      condition.column
        ? `Complete the filter for ${condition.column} or delete it before applying.`
        : "Choose a column for each filter or delete it before applying.",
    );
  }
  return condition;
}
