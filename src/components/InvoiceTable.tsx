"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import type { Review } from "@/lib/types";
import { money, VERDICT } from "./verdict";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  fontFamily: "inherit",
  fontSize: 15,
  backgroundColor: "#ffffff",
  foregroundColor: "#000000",
  headerBackgroundColor: "#ffffff",
  headerTextColor: "#000000",
  headerFontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  headerFontSize: 12,
  headerFontWeight: 400,
  borderColor: "#e6e6e6",
  rowBorder: { color: "#f1f1f1" },
  rowHoverColor: "#f7f7f5",
  selectedRowBackgroundColor: "#f7f7f5",
  accentColor: "#000000",
  rowHeight: 52,
  headerHeight: 44,
  wrapperBorderRadius: 24,
  cellHorizontalPadding: 20,
});

export function InvoiceTable({ reviews, onSelect }: { reviews: Review[]; onSelect: (id: string) => void }) {
  const columns = useMemo<ColDef<Review>[]>(
    () => [
      {
        headerName: "VERDICT",
        field: "verdict",
        width: 150,
        cellRenderer: ({ data }: { data?: Review }) =>
          data && <span className={`rounded-md px-2.5 py-1 text-[13px] font-[480] ${VERDICT[data.verdict].block}`}>{VERDICT[data.verdict].label}</span>,
      },
      {
        headerName: "FROM",
        flex: 1,
        minWidth: 160,
        valueGetter: ({ data }) => data?.invoice?.senderName ?? data?.invoice?.senderEmail ?? "Unknown sender",
      },
      {
        headerName: "AMOUNT",
        width: 130,
        type: "rightAligned",
        cellClass: "tabular-nums",
        valueGetter: ({ data }) => data?.invoice?.amount ?? null,
        valueFormatter: ({ data, value }) => (value == null || !data?.invoice ? "" : money(value, data.invoice.currency)),
      },
      {
        headerName: "WHY",
        flex: 2,
        minWidth: 220,
        sortable: false,
        tooltipValueGetter: ({ value }) => value,
        valueGetter: ({ data }) => data?.reasons[0]?.text ?? "Real, known sender, usual amount, clean wording",
      },
      {
        headerName: "CHECKED",
        field: "reviewedAt",
        width: 120,
        sort: "desc",
        valueFormatter: ({ value }) => new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      },
    ],
    [],
  );

  return (
    <div className="h-[460px]">
      <AgGridReact<Review>
        theme={theme}
        rowData={reviews}
        columnDefs={columns}
        getRowId={({ data }) => data.id}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onRowClicked={({ data }) => data && onSelect(data.id)}
        onCellKeyDown={({ data, event }) => data && (event as KeyboardEvent | undefined)?.key === "Enter" && onSelect(data.id)}
        overlayNoRowsTemplate="No invoices checked yet. Paste a link above."
      />
    </div>
  );
}
