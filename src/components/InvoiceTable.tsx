"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import type { Review } from "@/lib/types";
import { money, VERDICT } from "./verdict";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  fontFamily: "inherit",
  backgroundColor: "#ffffff",
  headerBackgroundColor: "#faf8f3",
  borderColor: "#e4e0d6",
  rowHoverColor: "#f7f5f0",
  selectedRowBackgroundColor: "#eef2fd",
  accentColor: "#1f4fd8",
  headerFontWeight: 600,
});

export function InvoiceTable({ reviews, onSelect }: { reviews: Review[]; onSelect: (id: string) => void }) {
  const columns = useMemo<ColDef<Review>[]>(
    () => [
      {
        headerName: "Verdict",
        field: "verdict",
        width: 140,
        cellRenderer: ({ data }: { data?: Review }) =>
          data && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${VERDICT[data.verdict].chip}`}>{VERDICT[data.verdict].label}</span>,
      },
      {
        headerName: "From",
        flex: 1,
        minWidth: 160,
        valueGetter: ({ data }) => data?.invoice?.senderName ?? data?.invoice?.senderEmail ?? "Unknown sender",
      },
      {
        headerName: "Amount",
        width: 130,
        type: "rightAligned",
        valueGetter: ({ data }) => data?.invoice?.amount ?? null,
        valueFormatter: ({ data, value }) => (value == null || !data?.invoice ? "" : money(value, data.invoice.currency)),
      },
      {
        headerName: "Why",
        flex: 2,
        minWidth: 220,
        sortable: false,
        valueGetter: ({ data }) => data?.reasons[0]?.text ?? "Real, known sender, usual amount, clean wording",
      },
      {
        headerName: "Checked",
        field: "reviewedAt",
        width: 120,
        sort: "desc",
        valueFormatter: ({ value }) => new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      },
    ],
    [],
  );

  return (
    <div className="h-[420px] overflow-hidden rounded-xl border border-line">
      <AgGridReact<Review>
        theme={theme}
        rowData={reviews}
        columnDefs={columns}
        getRowId={({ data }) => data.id}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onRowClicked={({ data }) => data && onSelect(data.id)}
        overlayNoRowsTemplate="No invoices checked yet. Paste a link above."
      />
    </div>
  );
}
