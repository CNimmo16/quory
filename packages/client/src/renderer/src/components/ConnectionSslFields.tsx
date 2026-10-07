import { useId, useState } from "react";
import type { DatabaseSslConfig } from "@quory/stack/server";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";

const certificateFields = [
  {
    name: "ca",
    label: "CA certificate",
    placeholder: "-----BEGIN CERTIFICATE-----",
  },
  {
    name: "cert",
    label: "Client certificate",
    placeholder: "-----BEGIN CERTIFICATE-----",
  },
  {
    name: "key",
    label: "Client private key",
    placeholder: "-----BEGIN PRIVATE KEY-----",
  },
] as const;

export function ConnectionSslFields({
  value,
  onChange,
}: {
  value: DatabaseSslConfig | undefined;
  onChange: (value: DatabaseSslConfig | undefined) => void;
}) {
  const id = useId();
  const [certificatesOpen, setCertificatesOpen] = useState(
    !!(value?.ca || value?.cert || value?.key)
  );

  return (
    <fieldset className="space-y-3 rounded-md border p-4">
      <legend className="px-1 text-sm font-medium">SSL / TLS</legend>
      <div className="space-y-2">
        <Label htmlFor={`${id}-mode`}>SSL mode</Label>
        <Select
          value={value?.mode ?? "disabled"}
          onValueChange={(mode) =>
            onChange(
              mode === "disabled"
                ? undefined
                : { ...value, mode: mode as DatabaseSslConfig["mode"] }
            )
          }
        >
          <SelectTrigger
            id={`${id}-mode`}
            aria-describedby={`${id}-description`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="disabled">Disabled</SelectItem>
            <SelectItem value="verify-full">
              Verify certificate and hostname
            </SelectItem>
            <SelectItem value="require">
              Require SSL (no certificate verification)
            </SelectItem>
          </SelectContent>
        </Select>
        <p id={`${id}-description`} className="text-sm text-muted-foreground">
          {!value
            ? "Connect without SSL encryption."
            : value.mode === "verify-full"
            ? "Encrypt the connection and verify the server's certificate and hostname."
            : "Encrypt the connection without verifying the server's identity. Use only with a trusted server."}
        </p>
      </div>
      {value && (
        <details
          className="space-y-3"
          open={certificatesOpen}
          onToggle={(event) => setCertificatesOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer text-sm font-medium">
            Custom certificates (optional)
          </summary>
          <p className="text-sm text-muted-foreground">
            Paste PEM contents. Leave the CA certificate blank to use trusted
            certificate authorities. For client authentication, provide both a
            certificate and its private key.
          </p>
          {certificateFields.map(({ name, label, placeholder }) => (
            <div key={name} className="space-y-2">
              <Label htmlFor={`${id}-${name}`}>{label}</Label>
              <Textarea
                id={`${id}-${name}`}
                value={value[name] ?? ""}
                onChange={(event) =>
                  onChange({ ...value, [name]: event.target.value })
                }
                placeholder={placeholder}
                spellCheck={false}
                autoComplete="off"
                className="resize-y font-mono text-xs"
                required={
                  name === "cert"
                    ? !!value.key?.trim()
                    : name === "key"
                    ? !!value.cert?.trim()
                    : false
                }
              />
            </div>
          ))}
        </details>
      )}
    </fieldset>
  );
}
