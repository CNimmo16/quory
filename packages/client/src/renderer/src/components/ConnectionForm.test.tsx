import { useState, type ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConnectionForm } from "./ConnectionForm";
import { TooltipProvider } from "./ui/tooltip";

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
