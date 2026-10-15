"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import type { Review } from "@/lib/types";
import { money, standing, TONE, type Tone } from "./verdict";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  fontFamily: "inherit",
  fontSize: 14,
  backgroundColor: "#ffffff",
  foregroundColor: "#151d48",
  headerBackgroundColor: "#ffffff",
  headerTextColor: "#737791",
  headerFontSize: 13,
  headerFontWeight: 400,
  borderColor: "transparent",
  rowBorder: { color: "#edf2f6" },
  headerRowBorder: { color: "#edf2f6" },
  columnBorder: false,
  rowHoverColor: "#fafbfc",
  selectedRowBackgroundColor: "#f3f3ff",
  accentColor: "#5d5fef",
  rowHeight: 56,
  headerHeight: 44,
  wrapperBorder: false,
  cellHorizontalPadding: 16,
});

function riskTone(p: number): Tone {
  return p >= 0.8 ? "pink" : p > 0.2 ? "orange" : "green";
}

function Risk({ review }: { review: Review }) {
  if (!review.wording) return <span className="text-muted">Not read</span>;
  const p = review.wording.isScam;
  const tone = TONE[riskTone(p)];
  const pct = Math.round(p * 100);
  return (
    <span className="flex h-full items-center gap-3 leading-5">
      <span className="h-1 w-20 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(pct, 3)}%` }} />
      </span>
      <span className={`rounded-md px-2 py-0.5 text-[12px] font-medium leading-5 tabular-nums ring-1 ring-current ${tone.ink}`}>{pct}%</span>
    </span>
  );
}

export function InvoiceTable({ reviews, onSelect }: { reviews: Review[]; onSelect: (id: string) => void }) {
  const columns = useMemo<ColDef<Review>[]>(
    () => [
      {
        headerName: "Status",
        width: 172,
        valueGetter: ({ data }) => (data ? standing(data).label : ""),
        cellRenderer: ({ data }: { data?: Review }) => {
          if (!data) return null;
          const s = standing(data);
          return <span className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] font-medium leading-5 ${TONE[s.tone].soft} ${TONE[s.tone].ink}`}>{s.label}</span>;
        },
      },
      {
        headerName: "From",
        flex: 1,
        minWidth: 150,
        valueGetter: ({ data }) =>
          data?.invoice?.senderName ?? data?.invoice?.senderEmail ?? data?.via?.subject ?? (data?.id.startsWith("MAIL-") ? "Pasted email" : "Unknown sender"),
        tooltipValueGetter: ({ value }) => value,
      },
      {
        headerName: "Amount",
        width: 120,
        type: "rightAligned",
        cellClass: "tabular-nums font-medium",
        valueGetter: ({ data }) => data?.invoice?.amount ?? null,
        valueFormatter: ({ data, value }) => (value == null || !data?.invoice ? "" : money(value, data.invoice.currency)),
      },
      {
        headerName: "Scam risk",
        width: 170,
        valueGetter: ({ data }) => data?.wording?.isScam ?? null,
        cellRenderer: ({ data }: { data?: Review }) => data && <Risk review={data} />,
      },
      {
        headerName: "Checked",
        field: "reviewedAt",
        width: 110,
        sort: "desc",
        cellClass: "text-muted",
        valueFormatter: ({ value }) => new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      },
    ],
    [],
  );

  return (
    <div className="h-[440px]">
      <AgGridReact<Review>
        theme={theme}
        rowData={reviews}
        columnDefs={columns}
        getRowId={({ data }) => data.id}
        rowSelection={{ mode: "singleRow", checkboxes: false, enableClickSelection: true }}
        onRowClicked={({ data }) => data && onSelect(data.id)}
        onCellKeyDown={({ data, event }) => data && (event as KeyboardEvent | undefined)?.key === "Enter" && onSelect(data.id)}
        overlayNoRowsTemplate="No invoices here yet. Paste a PayPal invoice link above."
      />
    </div>
  );
}
