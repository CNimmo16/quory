import { DataTable as Table } from "@quory/stack/react";
import type { ComponentProps } from "react";
import { useAppearance } from "./SettingsProvider";

export default function DataTable(props: ComponentProps<typeof Table>) {
  const { density } = useAppearance();
  return <Table {...props} rowHeight={density === "compact" ? 28 : 36} />;
}
