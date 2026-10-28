import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { FilterFieldPicker } from "./FilterFieldPicker";
import { TagsInput } from "./TagsInput";
import {
  type Condition,
  ConditionOperator,
  type DatabaseTableInfo,
  isBooleanCondition,
  isNullCondition,
  isListCondition,
  isValueCondition,
  type ListConditionOperator,
  listConditionOperators,
  type NullConditionOperator,
  nullConditionOperators,
  type ValueConditionOperator,
  valueConditionOperators,
} from "@quory/core";
import { produce } from "immer";
import { useEffect, useRef, useState } from "react";
import { FolderPlus, Plus, Trash2 } from "lucide-react";

const blankFilter = (): Condition => ({
  column: "",
  operator: ConditionOperator.EQUALS,
  value: "",
});

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
  depth = 0,
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
  depth?: number;
}) {
  const [columnOpen, setColumnOpen] = useState(false);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [groupOperatorOpen, setGroupOperatorOpen] = useState(false);
  const [focusValue, setFocusValue] = useState(0);
  const [focusChild, setFocusChild] = useState<{
    index: number;
    version: number;
  } | null>(null);
  const valueInput = useRef<HTMLInputElement>(null);
  const operatorTrigger = useRef<HTMLButtonElement>(null);

  const isBoolean = isBooleanCondition(condition);
  const isNull = isNullCondition(condition);
  useEffect(() => {
    if (!isBoolean && (autoFocus || focusColumnRequest !== undefined))
      setColumnOpen(true);
  }, [autoFocus, focusColumnRequest, isBoolean]);
  useEffect(() => {
    if (!focusValue || isBoolean) return;
    if (isNull) operatorTrigger.current?.focus();
    else {
      valueInput.current?.focus();
      valueInput.current?.select();
    }
  }, [focusValue, isBoolean, isNull]);

  function focusAt(index: number) {
    setFocusChild((current) => ({
      index,
      version: (current?.version ?? 0) + 1,
    }));
  }

  if (isBoolean) {
    return (
      <div
        role="group"
        aria-label="Filter group"
        className={`flex min-w-0 flex-col gap-3 ${onDelete ? "border-border rounded-md border p-3" : ""}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">Match</span>
          <FilterFieldPicker
            label="Filter group operator"
            advanceOnSelect={false}
            searchLabel="Search group operators"
            value={condition.operator.toUpperCase()}
            options={["AND", "OR"]}
            open={groupOperatorOpen}
            onOpenChange={setGroupOperatorOpen}
            onSelect={(operator) =>
              onConditionChange({
                ...condition,
                operator:
                  operator === "AND"
                    ? ConditionOperator.AND
                    : ConditionOperator.OR,
              })
            }
            className="w-24"
            maxHeight={maxDropdownHeight}
          />
          <span className="text-muted-foreground text-xs">
            {condition.operator === ConditionOperator.AND
              ? "all conditions"
              : "any condition"}
          </span>
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Delete group"
              className="text-muted-foreground hover:bg-destructive-subtle hover:text-destructive ml-auto size-8 shrink-0"
              onClick={onDelete}
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
            </Button>
          )}
        </div>
        {condition.conditions.length > 0 && (
          <div className="border-border flex min-w-0 flex-col gap-3 border-l-2 pl-3">
            {condition.conditions.map((subCondition, index) => (
              <ConditionEditor
                key={index}
                depth={depth + 1}
                condition={subCondition}
                autoFocus={autoFocus && index === 0}
                focusColumnRequest={
                  focusChild?.index === index
                    ? focusChild.version
                    : index === 0
                      ? focusColumnRequest
                      : undefined
                }
                onApply={
                  onApply
                    ? (updated) =>
                        onApply(
                          produce(condition, (draft) => {
                            draft.conditions[index] = updated;
                          }),
                        )
                    : undefined
                }
                onNextFilter={(updated) => {
                  let next = produce(condition, (draft) => {
                    draft.conditions[index] = updated;
                  });
                  let nextIndex = next.conditions.findIndex(
                    (child, position) =>
                      position > index &&
                      isValueCondition(child) &&
                      child.operator === ConditionOperator.EQUALS &&
                      !child.column &&
                      !child.value,
                  );
                  if (nextIndex < 0) {
                    nextIndex = next.conditions.length;
                    next = {
                      ...next,
                      conditions: [...next.conditions, blankFilter()],
                    };
                  }
                  onConditionChange(next);
                  focusAt(nextIndex);
                }}
                columns={columns}
                onConditionChange={(changedSubCondition) =>
                  onConditionChange(
                    produce(condition, (draft) => {
                      draft.conditions[index] = changedSubCondition;
                    }),
                  )
                }
                maxDropdownHeight={maxDropdownHeight}
                onDelete={() => {
                  onConditionChange(
                    produce(condition, (draft) => {
                      draft.conditions.splice(index, 1);
                    }),
                  );
                }}
              />
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={depth >= 20}
            className="text-muted-foreground hover:text-primary-emphasis h-7 px-2 text-xs"
            onClick={() => {
              onConditionChange({
                ...condition,
                conditions: [...condition.conditions, blankFilter()],
              });
              focusAt(condition.conditions.length);
            }}
          >
            <Plus aria-hidden="true" className="size-3.5" />
            Add filter
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={depth >= 19}
            className="text-muted-foreground hover:text-primary-emphasis h-7 px-2 text-xs"
            onClick={() => {
              onConditionChange({
                ...condition,
                conditions: [
                  ...condition.conditions,
                  {
                    operator: ConditionOperator.AND,
                    conditions: [blankFilter()],
                  },
                ],
              });
              focusAt(condition.conditions.length);
            }}
          >
            <FolderPlus aria-hidden="true" className="size-3.5" />
            Add group
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      onKeyDown={(event) => {
        if (
          !isNull ||
          operatorOpen ||
          event.target !== operatorTrigger.current ||
          event.key !== "Enter" ||
          event.nativeEvent.isComposing
        )
          return;
        event.preventDefault();
        if (event.shiftKey) onNextFilter?.(condition);
        else onApply?.(condition);
      }}
    >
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
      <FilterFieldPicker
        triggerRef={operatorTrigger}
        label="Filter operator"
        searchLabel="Search operators"
        value={condition.operator}
        options={[
          ...valueConditionOperators,
          ...listConditionOperators,
          ...nullConditionOperators,
        ]}
        open={operatorOpen}
        onOpenChange={setOperatorOpen}
        onSelect={(_value) => {
          const operator = _value as ConditionOperator;
          if (nullConditionOperators.includes(operator)) {
            onConditionChange({
              column: condition.column,
              operator: operator as NullConditionOperator,
            });
          } else if (listConditionOperators.includes(operator)) {
            onConditionChange({
              column: condition.column,
              operator: operator as ListConditionOperator,
              values: isListCondition(condition)
                ? condition.values
                : isValueCondition(condition) && condition.value
                  ? [condition.value]
                  : [],
            });
          } else {
            onConditionChange({
              column: condition.column,
              operator: operator as ValueConditionOperator,
              value: isValueCondition(condition) ? condition.value : "",
            });
          }
          setFocusValue((current) => current + 1);
        }}
        className="w-28"
        maxHeight={maxDropdownHeight}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      {isValueCondition(condition) && (
        <Input
          ref={valueInput}
          aria-label="Filter value"
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (event.shiftKey) onNextFilter?.(condition);
            else onApply?.(condition);
          }}
          className="border-border text-foreground focus-visible:ring-primary h-8 min-w-32 flex-1 text-xs shadow-none"
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
        aria-label="Wrap filter in group"
        title="Wrap filter in group"
        disabled={depth >= 20}
        className="text-muted-foreground hover:text-primary-emphasis size-8 shrink-0"
        onClick={() =>
          onConditionChange({
            operator: ConditionOperator.AND,
            conditions: [condition],
          })
        }
      >
        <FolderPlus aria-hidden="true" className="size-3.5" />
      </Button>
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Delete filter"
          className="text-muted-foreground hover:bg-destructive-subtle hover:text-destructive size-8 shrink-0"
          onClick={onDelete}
        >
          <Trash2 aria-hidden="true" className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
