import { createContext, useContext, useState, type ReactNode } from "react";

const NewQueryDraftContext = createContext<{
  draft: string;
  setDraft: (draft: string) => void;
} | null>(null);

// Keep an unsent prompt while selecting a project or connecting remounts Quory.
export function NewQueryDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState("");
  return (
    <NewQueryDraftContext.Provider value={{ draft, setDraft }}>
      {children}
    </NewQueryDraftContext.Provider>
  );
}

export function useNewQueryDraft() {
  const context = useContext(NewQueryDraftContext);
  if (!context) throw new Error("New query requires the draft provider.");
  return context;
}
