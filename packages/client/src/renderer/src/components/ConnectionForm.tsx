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
import { ConnectionSslFields } from "./ConnectionSslFields";
import { CONNECTION_COLOURS } from "../../../shared/connectionColour";
import { connectionColours } from "./connectionColours";
import { Check } from "lucide-react";

const databaseDefaults = {
  postgres: {
    hostOrFilePath: "localhost",
    port: 5432,
    username: "postgres",
    password: "",
    database: "postgres",
  },
  mysql: {
    hostOrFilePath: "localhost",
    port: 3306,
    username: "root",
    password: "",
    database: "mysql",
  },
};

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
  const typeSpecificFieldsWithDefaults =
    config.type === "postgres" || config.type === "mysql"
      ? databaseDefaults[config.type]
      : null;

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
            onValueChange={(value) => {
              const type = value as keyof typeof databaseDefaults;
              setConfig({ ...config, ...databaseDefaults[type], type });
            }}
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
            <ConnectionSslFields
              value={config.ssl}
              onChange={(ssl) => setConfig({ ...config, ssl })}
            />
          </>
        )}
        <fieldset className="space-y-2" disabled={isSaving || isConnecting}>
          <legend className="text-sm font-medium">Connection colour</legend>
          <div className="flex flex-wrap gap-2">
            {CONNECTION_COLOURS.map((colour) => (
              <label
                key={colour}
                title={connectionColours[colour].label}
                className="relative flex size-9 cursor-pointer items-center justify-center"
              >
                <input
                  type="radio"
                  name="connection-colour"
                  aria-label={connectionColours[colour].label}
                  value={colour}
                  checked={(config.colour ?? "teal") === colour}
                  onChange={() => setConfig({ ...config, colour })}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`flex size-7 items-center justify-center rounded-full text-primary-foreground peer-checked:ring-2 peer-checked:ring-foreground peer-checked:ring-offset-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-primary ${connectionColours[colour].dot}`}
                >
                  {(config.colour ?? "teal") === colour && (
                    <Check className="size-4" />
                  )}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="write-protection">Write protection</Label>
          <Select
            value={config.writeProtection ?? "read-only"}
            onValueChange={(writeProtection) =>
              setConfig({
                ...config,
                writeProtection: writeProtection as NonNullable<
                  typeof config.writeProtection
                >,
              })
            }
          >
            <SelectTrigger id="write-protection">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="read-only">Read only</SelectItem>
              <SelectItem value="confirm-before-write">
                Confirm before write
              </SelectItem>
              <SelectItem value="dangerously-write">
                Dangerously write
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {config.writeProtection === "dangerously-write"
              ? "SQL can change or delete data without confirmation."
              : config.writeProtection === "confirm-before-write"
                ? "You must confirm each SQL statement that may change data."
                : "SQL cannot change data on this connection."}
          </p>
        </div>
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
                (field) => !config[field as keyof typeof config],
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
