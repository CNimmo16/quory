import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { FilterFieldPicker } from "./FilterFieldPicker";
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
import { Fragment, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

export default function ConditionEditor({
  columns,
  condition,
  onConditionChange,
  onDelete,
  isGhost = false,
  onFocus,
  onBlur,
  maxDropdownHeight,
  autoFocus = false,
  focusColumnRequest,
  onApply,
  onNextFilter,
}: {
  columns: DatabaseTableInfo["columns"];
  condition: Condition;
  onConditionChange: (condition: Condition) => void;
  onDelete?: () => void;
  isGhost?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  maxDropdownHeight: number;
  autoFocus?: boolean;
  focusColumnRequest?: number | undefined;
  onApply?: ((updated: Condition) => void) | undefined;
  onNextFilter?: ((updated: Condition) => void) | undefined;
}) {
  const [ghostFocused, setGhostFocused] = useState(false);
  const [columnOpen, setColumnOpen] = useState(false);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [focusValue, setFocusValue] = useState(0);
  const [focusChild, setFocusChild] = useState<{
    index: number;
    version: number;
  } | null>(null);
  const valueInput = useRef<HTMLInputElement>(null);

  const isBoolean = isBooleanCondition(condition);
  useEffect(() => {
    if (!isBoolean && (autoFocus || focusColumnRequest !== undefined))
      setColumnOpen(true);
  }, [autoFocus, focusColumnRequest, isBoolean]);
  useEffect(() => {
    if (!focusValue || isBoolean) return;
    valueInput.current?.focus();
    valueInput.current?.select();
  }, [focusValue, isBoolean]);

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
                      variant="ghost"
                      className="h-6 px-2 text-[10px] font-semibold uppercase text-slate-500 hover:bg-slate-100 hover:text-teal-700"
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
                autoFocus={autoFocus && index === 0}
                focusColumnRequest={
                  focusChild?.index === index ? focusChild.version : undefined
                }
                onApply={
                  onApply
                    ? (updated) =>
                        onApply(
                          produce(condition, (draft) => {
                            draft.conditions[index] = updated;
                          })
                        )
                    : undefined
                }
                onNextFilter={(updated) => {
                  const next = produce(condition, (draft) => {
                    draft.conditions[index] = updated;
                  });
                  let nextIndex = next.conditions.findIndex(
                    (child, position) =>
                      position > index &&
                      isValueCondition(child) &&
                      !child.column &&
                      !child.value
                  );
                  let withNext = next;
                  if (nextIndex < 0) {
                    nextIndex = next.conditions.length;
                    withNext = {
                      ...next,
                      conditions: [
                        ...next.conditions,
                        {
                          column: "",
                          operator: ConditionOperator.EQUALS,
                          value: "",
                        },
                      ],
                    };
                  }
                  onConditionChange(withNext);
                  setFocusChild((current) => ({
                    index: nextIndex,
                    version: (current?.version ?? 0) + 1,
                  }));
                }}
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
    <div className="flex flex-wrap items-center gap-2">
      <FilterFieldPicker
        label="Filter column"
        searchLabel="Search columns"
        value={condition.column}
        placeholder={isGhost ? "Add a filter" : "Select column"}
        options={columns.map((column) => column.name)}
        open={columnOpen}
        onOpenChange={setColumnOpen}
        onSelect={(column) => {
          onConditionChange({ ...condition, column });
          setOperatorOpen(true);
        }}
        className={`w-40 max-w-full ${isGhost ? "border-dashed" : ""}`}
        maxHeight={maxDropdownHeight}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {!isGhost && (
        <>
          <FilterFieldPicker
            label="Filter operator"
            searchLabel="Search operators"
            value={condition.operator}
            options={[...valueConditionOperators, ...listConditionOperators]}
            open={operatorOpen}
            onOpenChange={setOperatorOpen}
            onSelect={(_value) => {
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
              setFocusValue((current) => current + 1);
            }}
            className="w-24"
            maxHeight={maxDropdownHeight}
            onFocus={onFocus}
            onBlur={onBlur}
          />
          {isValueCondition(condition) && (
            <Input
              ref={valueInput}
              aria-label="Filter value"
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing)
                  return;
                event.preventDefault();
                if (!isConditionComplete(condition)) return;
                if (event.shiftKey) onNextFilter?.(condition);
                else onApply?.(condition);
              }}
              className="h-8 min-w-32 flex-1 border-slate-200 text-xs text-slate-700 shadow-none focus-visible:ring-teal-600"
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
              inputRef={valueInput}
              onSubmit={(values, next) => {
                const updated = { ...condition, values };
                if (!isConditionComplete(updated)) return;
                if (next) onNextFilter?.(updated);
                else onApply?.(updated);
              }}
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
            className="size-8 shrink-0 text-slate-400 hover:bg-red-50 hover:text-red-700"
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}
