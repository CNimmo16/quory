import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { Spinner } from "./LoadingState";

export function SaveQueryDialog({
  initialName,
  pending,
  error,
  onSave,
  onClose,
}: {
  initialName: string;
  pending: boolean;
  error: string | undefined;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>Save query</DialogTitle>
        <DialogDescription>
          Give this query a name to keep it in this project.
        </DialogDescription>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && !pending) onSave(name.trim());
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="save-query-name">Query name</Label>
            <Input
              id="save-query-name"
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || !name.trim()}
              aria-busy={pending}
            >
              {pending && <Spinner />}Save query
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
