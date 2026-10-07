import { useEffect, useMemo } from "react";
import type { AppRouter } from "../../../main/ipc";
import type { inferProcedureInput } from "@trpc/server";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Label } from "./ui/label";
import { TextField } from "./TextField";
import { Hint } from "./Hint";
import { Spinner } from "./LoadingState";

export function ConnectionForm({
  config,
  setConfig,
  errorMessage,
  onSave,
  onConnect,
  isSaving,
  isConnecting,
  saveText,
}: {
  config: Partial<
    inferProcedureInput<AppRouter["connections"]["saveConnection"]>["config"]
  >;
  setConfig: React.Dispatch<
    React.SetStateAction<
      Partial<
        inferProcedureInput<
          AppRouter["connections"]["saveConnection"]
        >["config"]
      >
    >
  >;
  errorMessage?: string | undefined;
  onSave: () => void;
  isSaving: boolean;
  onConnect?: () => void;
  isConnecting?: boolean;
  saveText: string;
}) {
  const typeSpecificFieldsWithDefaults = useMemo((): typeof config | null => {
    if (!config.type) {
      return null;
    }
    if (config.type === "postgres") {
      return {
        hostOrFilePath: "localhost",
        port: 5432,
        username: "postgres",
        password: "",
        database: "postgres",
      };
    }
    if (config.type === "mysql") {
      return {
        hostOrFilePath: "localhost",
        port: 3306,
        username: "root",
        password: "",
        database: "mysql",
      };
    }
    return null;
  }, [config.type]);

  useEffect(() => {
    if (typeSpecificFieldsWithDefaults) {
      setConfig((prev) => ({
        ...prev,
        ...typeSpecificFieldsWithDefaults,
      }));
    }
  }, [typeSpecificFieldsWithDefaults, setConfig]);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        className="flex w-full flex-col gap-4"
      >
        <div className="space-y-2">
          <Label htmlFor="database-type">
            Database type
            <span aria-hidden="true" className="ml-1 text-destructive">
              *
            </span>
          </Label>
          <Select
            value={config.type ?? ""}
            onValueChange={(value) =>
              setConfig({ ...config, type: value as "postgres" | "mysql" })
            }
            required
          >
            <SelectTrigger id="database-type">
              <SelectValue placeholder="Select database type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="postgres">postgres</SelectItem>
              <SelectItem value="mysql">mysql</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {typeSpecificFieldsWithDefaults && (
          <>
            {"hostOrFilePath" in typeSpecificFieldsWithDefaults && (
              <TextField
                label="Host"
                value={config.hostOrFilePath ?? ""}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    hostOrFilePath: event.target.value,
                  })
                }
                required
              />
            )}
            {"port" in typeSpecificFieldsWithDefaults && (
              <TextField
                label="Port"
                value={config.port ?? ""}
                type="number"
                onChange={(event) =>
                  setConfig({
                    ...config,
                    port: Number(event.target.value),
                  })
                }
                required
              />
            )}
            {"username" in typeSpecificFieldsWithDefaults && (
              <TextField
                label="Username"
                value={config.username ?? ""}
                onChange={(event) =>
                  setConfig({ ...config, username: event.target.value })
                }
                required
              />
            )}
            {"password" in typeSpecificFieldsWithDefaults && (
              <TextField
                type="password"
                label="Password"
                value={config.password ?? ""}
                onChange={(event) =>
                  setConfig({ ...config, password: event.target.value })
                }
                required
              />
            )}
            {"database" in typeSpecificFieldsWithDefaults && (
              <TextField
                label="Database"
                value={config.database ?? ""}
                onChange={(event) =>
                  setConfig({ ...config, database: event.target.value })
                }
                required
              />
            )}
            <TextField
              label="Connection nickname"
              value={config.nickname ?? ""}
              onChange={(event) =>
                setConfig({ ...config, nickname: event.target.value })
              }
              required
            />
          </>
        )}
        {errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={
              isSaving ||
              !typeSpecificFieldsWithDefaults ||
              Object.keys(typeSpecificFieldsWithDefaults).some(
                (field) => !config[field as keyof typeof config]
              ) ||
              !config.nickname
            }
            aria-busy={isSaving}
            variant="secondary"
          >
            {isSaving && <Spinner />}
            {saveText}
          </Button>
          <Hint
            content="You must save your new connection before connecting"
            disabled={!!onConnect}
          >
            <Button
              type="button"
              onClick={onConnect}
              disabled={!onConnect || isConnecting}
              aria-busy={isConnecting ?? false}
            >
              {isConnecting && <Spinner />}
              Connect
            </Button>
          </Hint>
        </div>
      </form>
    </div>
  );
}
