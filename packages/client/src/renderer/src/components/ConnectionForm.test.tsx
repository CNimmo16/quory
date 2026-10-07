import { useState, type ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectionForm } from "./ConnectionForm";
import { TooltipProvider } from "./ui/tooltip";

type ConnectionConfig = ComponentProps<typeof ConnectionForm>["config"];

function SavedConnectionForm({
  initialConfig,
  save,
}: {
  initialConfig: ConnectionConfig;
  save: (config: ConnectionConfig) => void;
}) {
  const [config, setConfig] = useState(initialConfig);
  return (
    <TooltipProvider>
      <ConnectionForm
        config={config}
        setConfig={setConfig}
        onSave={() => save(config)}
        isSaving={false}
        saveText="Save connection"
      />
    </TooltipProvider>
  );
}

const savedConnection: ConnectionConfig = {
  type: "postgres",
  hostOrFilePath: "db.example.com",
  port: 6432,
  username: "app-user",
  password: "secret",
  database: "app",
  nickname: "Production",
};

describe("ConnectionForm", () => {
  it("selects database defaults, validates required fields and reveals passwords without submitting", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    function Form() {
      const [config, setConfig] = useState<
        ComponentProps<typeof ConnectionForm>["config"]
      >({});
      return (
        <TooltipProvider>
          <ConnectionForm
            config={config}
            setConfig={setConfig}
            onSave={() => save(config)}
            isSaving={false}
            saveText="Save connection"
          />
        </TooltipProvider>
      );
    }
    render(<Form />);
    expect(
      screen.getByRole("button", { name: "Save connection" })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
    await user.click(screen.getByRole("combobox", { name: /Database type/ }));
    await user.click(screen.getByRole("option", { name: "postgres" }));
    expect(screen.getByLabelText(/Port/)).toHaveValue(5432);
    expect(screen.getByLabelText(/Username/)).toHaveValue("postgres");
    expect(
      screen.getByRole("combobox", { name: "SSL mode" })
    ).toHaveTextContent("Disabled");
    await user.type(screen.getByLabelText(/^Password/), "secret");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("type", "text");
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Save connection" })
    ).toBeDisabled();
    await user.type(screen.getByLabelText(/Connection nickname/), "Local DB");
    await user.click(screen.getByRole("button", { name: "Save connection" }));
    expect(save).toHaveBeenCalledWith({
      type: "postgres",
      hostOrFilePath: "localhost",
      port: 5432,
      username: "postgres",
      password: "secret",
      database: "postgres",
      nickname: "Local DB",
    });
    await user.click(screen.getByRole("combobox", { name: /Database type/ }));
    await user.click(screen.getByRole("option", { name: "mysql" }));
    expect(screen.getByLabelText(/Port/)).toHaveValue(3306);
    expect(screen.getByLabelText(/Username/)).toHaveValue("root");
    expect(screen.getByLabelText(/^Password/)).toHaveValue("");
  });

  it.each(["postgres", "mysql"] as const)(
    "saves SSL and custom certificates for %s",
    async (type) => {
      const user = userEvent.setup();
      const save = vi.fn();
      render(
        <SavedConnectionForm
          initialConfig={{ ...savedConnection, type }}
          save={save}
        />
      );
      await user.click(screen.getByRole("combobox", { name: "SSL mode" }));
      await user.click(
        screen.getByRole("option", { name: "Verify certificate and hostname" })
      );
      await user.click(screen.getByText("Custom certificates (optional)"));
      await user.type(screen.getByLabelText("CA certificate"), "CA PEM");
      await user.type(screen.getByLabelText("Client certificate"), "CERT PEM");
      expect(screen.getByLabelText("Client private key")).toBeRequired();
      await user.click(screen.getByRole("button", { name: "Save connection" }));
      expect(save).not.toHaveBeenCalled();
      await user.type(screen.getByLabelText("Client private key"), "KEY PEM");
      await user.click(screen.getByRole("button", { name: "Save connection" }));
      expect(save).toHaveBeenCalledWith({
        ...savedConnection,
        type,
        ssl: {
          mode: "verify-full",
          ca: "CA PEM",
          cert: "CERT PEM",
          key: "KEY PEM",
        },
      });
    }
  );

  it("preserves saved connection details and SSL settings when reopening the form", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    const config: ConnectionConfig = {
      ...savedConnection,
      ssl: {
        mode: "verify-full",
        ca: "CA PEM",
        cert: "CERT PEM",
        key: "KEY PEM",
      },
    };
    render(<SavedConnectionForm initialConfig={config} save={save} />);
    expect(screen.getByLabelText(/^Host/)).toHaveValue("db.example.com");
    expect(screen.getByLabelText(/^Port/)).toHaveValue(6432);
    expect(screen.getByLabelText("CA certificate")).toHaveValue("CA PEM");
    expect(screen.getByLabelText("Client certificate")).toHaveValue("CERT PEM");
    expect(screen.getByLabelText("Client private key")).toHaveValue("KEY PEM");
    await user.click(screen.getByRole("button", { name: "Save connection" }));
    expect(save).toHaveBeenCalledWith(config);
  });

  it("supports SSL without verification and removes SSL settings when disabled", async () => {
    const user = userEvent.setup();
    const save = vi.fn();
    render(<SavedConnectionForm initialConfig={savedConnection} save={save} />);
    await user.click(screen.getByRole("combobox", { name: "SSL mode" }));
    await user.click(
      screen.getByRole("option", {
        name: "Require SSL (no certificate verification)",
      })
    );
    await user.click(screen.getByRole("button", { name: "Save connection" }));
    expect(save).toHaveBeenLastCalledWith({
      ...savedConnection,
      ssl: { mode: "require" },
    });
    await user.click(screen.getByRole("combobox", { name: "SSL mode" }));
    await user.click(screen.getByRole("option", { name: "Disabled" }));
    expect(
      screen.queryByText("Custom certificates (optional)")
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save connection" }));
    expect(save).toHaveBeenLastCalledWith({
      ...savedConnection,
      ssl: undefined,
    });
  });

  it("prevents repeated saves and connections while a request is pending", () => {
    render(
      <TooltipProvider>
        <ConnectionForm
          config={{
            type: "postgres",
            nickname: "Local",
            hostOrFilePath: "localhost",
            port: 5432,
            username: "postgres",
            password: "secret",
            database: "postgres",
          }}
          setConfig={vi.fn()}
          onSave={vi.fn()}
          onConnect={vi.fn()}
          isSaving
          isConnecting
          saveText="Save changes"
        />
      </TooltipProvider>
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled();
  });
});
