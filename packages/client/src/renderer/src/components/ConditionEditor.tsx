import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { TagsInput } from "./TagsInput";
import { Hint } from "./Hint";
import {
  Condition,
  ConditionOperator,
  DatabaseTableInfo,
  isBooleanCondition,
  isConditionComplete,
  isListCondition,
  isValueCondition,
  ListCondition,
  ListConditionOperator,
  listConditionOperators,
  ValueCondition,
  ValueConditionOperator,
  valueConditionOperators,
} from "@quory/core";
import { produce } from "immer";
import { Fragment, useEffect, useState } from "react";
import { AiOutlineDelete } from "react-icons/ai";

export default function ConditionEditor({
  columns,
  condition,
  onConditionChange,
  onDelete,
  isGhost = false,
  onFocus,
  onBlur,
  maxDropdownHeight,
}: {
  columns: DatabaseTableInfo["columns"];
  condition: Condition;
  onConditionChange: (condition: Condition) => void;
  onDelete?: () => void;
  isGhost?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  maxDropdownHeight: number;
}) {
  const [ghostFocused, setGhostFocused] = useState(false);

  const isBoolean = isBooleanCondition(condition);

  useEffect(() => {
    if (isBoolean && isConditionComplete(condition)) {
      setGhostFocused(false);
      onConditionChange({
        ...condition,
        conditions: [
          ...condition.conditions,
          {
            column: "",
            operator: ConditionOperator.EQUALS,
            value: "",
          },
        ],
      });
    }
  }, [isBoolean, condition, onConditionChange]);

  if (isBoolean) {
    return (
      <div className="flex flex-col gap-2">
        {condition.conditions.map((subCondition, index) => {
          return (
            <Fragment key={index}>
              {index > 0 && (
                <div>
                  <Hint
                    content={`Click to switch to ${
                      condition.operator === ConditionOperator.AND
                        ? "OR"
                        : "AND"
                    }`}
                    side="right"
                  >
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => {
                        onConditionChange({
                          ...condition,
                          operator:
                            condition.operator === ConditionOperator.AND
                              ? ConditionOperator.OR
                              : ConditionOperator.AND,
                        });
                      }}
                    >
                      {condition.operator}
                    </Button>
                  </Hint>
                </div>
              )}
              <ConditionEditor
                condition={subCondition}
                columns={columns}
                onConditionChange={(changedSubCondition) =>
                  onConditionChange(
                    produce(condition, (draft) => {
                      draft.conditions[index] = changedSubCondition;
                    })
                  )
                }
                maxDropdownHeight={maxDropdownHeight}
                onDelete={() => {
                  onConditionChange(
                    produce(condition, (draft) => {
                      draft.conditions.splice(index, 1);
                    })
                  );
                }}
                isGhost={
                  index === condition.conditions.length - 1 &&
                  !ghostFocused &&
                  isValueCondition(subCondition) &&
                  !subCondition.column &&
                  !subCondition.value
                }
              />
            </Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={condition.column}
        onValueChange={(column) => onConditionChange({ ...condition, column })}
      >
        <SelectTrigger
          aria-label="Filter column"
          className={`w-44 max-w-full shadow-none ${
            isGhost ? "border-dashed" : ""
          }`}
          onFocus={onFocus}
          onBlur={onBlur}
        >
          <SelectValue
            placeholder={isGhost ? "Add a filter" : "Select column"}
          />
        </SelectTrigger>
        <SelectContent
          position="popper"
          className="shadow-none"
          style={{ maxHeight: maxDropdownHeight }}
        >
          {columns.map((column) => (
            <SelectItem key={column.name} value={column.name}>
              {column.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!isGhost && (
        <>
          <Select
            value={condition.operator}
            onValueChange={(_value) => {
              const value = _value as ConditionOperator;
              if (
                valueConditionOperators.includes(value) &&
                isListCondition(condition)
              ) {
                onConditionChange({
                  column: condition.column,
                  operator: value as ValueConditionOperator,
                  value: "",
                } satisfies ValueCondition);
              } else if (
                listConditionOperators.includes(value) &&
                isValueCondition(condition)
              ) {
                onConditionChange({
                  column: condition.column,
                  operator: value as ListConditionOperator,
                  values: condition.value ? [condition.value] : [],
                } satisfies ListCondition);
              } else {
                onConditionChange(
                  isValueCondition(condition)
                    ? {
                        ...condition,
                        operator: value as ValueConditionOperator,
                      }
                    : { ...condition, operator: value as ListConditionOperator }
                );
              }
            }}
          >
            <SelectTrigger
              aria-label="Filter operator"
              className="w-28 shadow-none"
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="shadow-none"
              style={{ maxHeight: maxDropdownHeight }}
            >
              {[...valueConditionOperators, ...listConditionOperators].map(
                (operator) => (
                  <SelectItem key={operator} value={operator}>
                    {operator}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          {isValueCondition(condition) && (
            <Input
              aria-label="Filter value"
              className="min-w-32 flex-1 shadow-none"
              value={condition.value}
              onChange={(event) =>
                onConditionChange({ ...condition, value: event.target.value })
              }
              onFocus={onFocus}
              onBlur={onBlur}
            />
          )}
          {isListCondition(condition) && (
            <TagsInput
              value={condition.values}
              onChange={(values) => onConditionChange({ ...condition, values })}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Delete filter"
            className="shrink-0 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <AiOutlineDelete />
          </Button>
        </>
      )}
    </div>
  );
}
