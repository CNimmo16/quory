import {
  ActionIcon,
  Anchor,
  Group,
  Select,
  TagsInput,
  TextInput,
  Tooltip,
} from "@mantine/core";
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
                  <Tooltip
                    label={`Click to switch to ${
                      condition.operator === ConditionOperator.AND
                        ? "OR"
                        : "AND"
                    }`}
                    position="right"
                  >
                    <Anchor
                      component="button"
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
                    </Anchor>
                  </Tooltip>
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
    <Group>
      <Select
        data={columns.map((column) => ({
          label: column.name,
          value: column.name,
        }))}
        value={condition.column}
        onChange={(value) => {
          if (value) {
            onConditionChange({
              ...condition,
              column: value,
            });
          }
        }}
        placeholder={isGhost ? "Add a filter" : ""}
        onFocus={onFocus}
        onBlur={onBlur}
        comboboxProps={{ withinPortal: false }}
        styles={isGhost ? { input: { border: "1px dashed #ccc" } } : {}}
      />
      {!isGhost && (
        <>
          <Select
            data={[...valueConditionOperators, ...listConditionOperators]}
            value={condition.operator}
            onChange={(_value) => {
              const value = _value as ConditionOperator;
              if (value) {
                if (
                  valueConditionOperators.includes(value) &&
                  isListCondition(condition)
                ) {
                  // changing from list to value
                  onConditionChange({
                    column: condition.column,
                    operator: value as ValueConditionOperator,
                    value: "",
                  } satisfies ValueCondition);
                } else if (
                  listConditionOperators.includes(value) &&
                  isValueCondition(condition)
                ) {
                  // changing from value to list
                  onConditionChange({
                    column: condition.column,
                    operator: value as ListConditionOperator,
                    values: [condition.value],
                  } satisfies ListCondition);
                } else {
                  onConditionChange(
                    isValueCondition(condition)
                      ? {
                          ...condition,
                          operator: value as ValueConditionOperator,
                        }
                      : {
                          ...condition,
                          operator: value as ListConditionOperator,
                        }
                  );
                }
              }
            }}
            withCheckIcon={false}
            maxDropdownHeight={maxDropdownHeight}
            comboboxProps={{ withinPortal: false }}
            onFocus={onFocus}
            onBlur={onBlur}
            styles={isGhost ? { input: { border: "1px dashed #ccc" } } : {}}
          />
          {valueConditionOperators.includes(condition.operator) &&
            ((valueCondition) => {
              return (
                <TextInput
                  value={valueCondition.value}
                  onChange={(e) => {
                    onConditionChange({
                      ...valueCondition,
                      value: e.target.value,
                    });
                  }}
                  onFocus={onFocus}
                  onBlur={onBlur}
                  styles={
                    isGhost ? { input: { border: "1px dashed #ccc" } } : {}
                  }
                />
              );
            })(condition as ValueCondition)}
          {listConditionOperators.includes(condition.operator) &&
            ((listCondition) => {
              return (
                <TagsInput
                  value={listCondition.values}
                  onChange={(values) => {
                    onConditionChange({
                      ...listCondition,
                      values: values,
                    });
                  }}
                  onFocus={onFocus}
                  onBlur={onBlur}
                  styles={
                    isGhost ? { input: { border: "1px dashed #ccc" } } : {}
                  }
                />
              );
            })(condition as ListCondition)}
          <ActionIcon onClick={onDelete} color="red">
            <AiOutlineDelete />
          </ActionIcon>
        </>
      )}
    </Group>
  );
}
