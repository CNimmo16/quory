import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";

export function TextField({
  label,
  type = "text",
  id,
  ...props
}: ComponentProps<typeof Input> & { label: string }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>
        {label}
        {props.required && (
          <span aria-hidden="true" className="ml-1 text-destructive">
            *
          </span>
        )}
      </Label>
      <div className="relative">
        <Input
          {...props}
          id={inputId}
          type={isPassword && passwordVisible ? "text" : type}
          className={isPassword ? "pr-10" : props.className}
        />
        {isPassword && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0"
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible(!passwordVisible)}
          >
            {passwordVisible ? <EyeOff /> : <Eye />}
          </Button>
        )}
      </div>
    </div>
  );
}
