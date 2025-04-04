import { ArrowDownTrayIcon } from "@heroicons/react/20/solid";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { partition } from "lodash-es";
import Link from "next/link";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import StripeMicrodepositVerification from "@/app/administrator/settings/StripeMicrodepositVerification";
import {
  ApproveButton,
  RejectModal,
  useApproveInvoices,
  useAreTaxRequirementsMet,
  useIsActionable,
  useIsPayable,
} from "@/app/invoices/index";
import { StatusNotice, StatusWithTooltip } from "@/app/invoices/Status";
import { Task } from "@/app/updates/team/Task";
import Button from "@/components/Button";
import { Card, CardRow } from "@/components/Card";
import Checkbox from "@/components/Checkbox";
import MainLayout from "@/components/layouts/Main";
import Modal from "@/components/Modal";
import MutationButton from "@/components/MutationButton";
import Notice from "@/components/Notice";
import PaginationSection, { usePage } from "@/components/PaginationSection";
import Placeholder from "@/components/Placeholder";
import Sheet from "@/components/Sheet";
import Table, { createColumnHelper, useTable } from "@/components/Table";
import Tabs from "@/components/Tabs";
import { useCurrentCompany } from "@/global";
import type { RouterOutput } from "@/trpc";
import { trpc } from "@/trpc/client";
import { formatMoneyFromCents } from "@/utils/formatMoney";
import { pluralize } from "@/utils/pluralize";
import { export_company_invoices_path } from "@/utils/routes";
import { formatDate, formatDuration } from "@/utils/time";

type Invoice = RouterOutput["invoices"]["list"]["invoices"][number];
const perPage = 50;
export default function AdminList() {
  const company = useCurrentCompany();
  const [invoiceFilter] = useQueryState(
    "tab",
    parseAsStringLiteral(["history", "actionable"]).withDefault("actionable"),
  );
  const [openModal, setOpenModal] = useState<"approve" | "reject" | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [page] = usePage();
  const isActionable = useIsActionable();
  const isPayable = useIsPayable();
  const areTaxRequirementsMet = useAreTaxRequirementsMet();
  const [data, { refetch }] = trpc.invoices.list.useSuspenseQuery({
    companyId: company.id,
    perPage,
    page,
    invoiceFilter,
  });

  const approveInvoices = useApproveInvoices(() => {
    setOpenModal(null);
    table.resetRowSelection();
    void refetch();
  });

  const columnHelper = createColumnHelper<(typeof data.invoices)[number]>();
  const columns = useMemo(
    () => [
      columnHelper.accessor("billFrom", {
        header: "Contractor",
        cell: (info) => (
          <>
            <b className="truncate">{info.getValue()}</b>
            <div className="text-xs text-gray-500">{info.row.original.contractor.role.name}</div>
          </>
        ),
      }),
      columnHelper.simple("invoiceDate", "Sent on", (value) => (value ? formatDate(value) : "N/A")),
      columnHelper.simple("totalMinutes", "Hours", (value) => (value ? formatDuration(value) : "N/A"), "numeric"),
      columnHelper.simple(
        "totalAmountInUsdCents",
        "Amount",
        (value) => (value ? formatMoneyFromCents(value) : "N/A"),
        "numeric",
      ),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => <StatusWithTooltip invoice={info.row.original} />,
      }),
      columnHelper.display({
        id: "actions",
        cell: (info) => (isActionable(info.row.original) ? <ApproveButton invoice={info.row.original} /> : null),
      }),
    ],
    [company.requiredInvoiceApprovals],
  );

  const table = useTable({
    columns,
    data: data.invoices,
    getRowId: (invoice) => invoice.id,
    enableRowSelection: invoiceFilter === "actionable",
  });

  const selectedInvoices = table.getSelectedRowModel().rows.map((row) => row.original);
  const [selectedPayableInvoices, selectedApprovableInvoices] = partition(selectedInvoices, isPayable);

  return (
    <MainLayout
      title="Invoicing"
      headerActions={
        invoiceFilter === "history" && (
          <Button variant="outline" asChild>
            <a href={export_company_invoices_path(company.id)}>
              <ArrowDownTrayIcon className="size-4" />
              Download CSV
            </a>
          </Button>
        )
      }
      footer={
        invoiceFilter === "actionable" &&
        selectedInvoices.length > 0 && (
          <Sheet
            primary
            actions={
              <>
                <Button disabled={!company.completedPaymentMethodSetup} onClick={() => setOpenModal("approve")}>
                  Approve selected
                </Button>
                <Button variant="outline" onClick={() => setOpenModal("reject")}>
                  Reject selected
                </Button>
              </>
            }
          >
            <b>{selectedInvoices.length} selected</b>
          </Sheet>
        )
      }
    >
      <Tabs
        links={[
          { label: "Open", route: "?" },
          { label: "History", route: "?tab=history" },
        ]}
      />

      <StripeMicrodepositVerification />

      {data.invoices.length > 0 && (
        <div className="grid gap-4">
          {!company.completedPaymentMethodSetup && (
            <Notice variant="critical">
              <strong>Bank account setup incomplete.</strong> We're waiting for your bank details to be confirmed. Once
              done, you'll be able to start approving invoices and paying contractors.
            </Notice>
          )}

          {invoiceFilter === "actionable" && data.invoices.some((invoice) => !areTaxRequirementsMet(invoice)) && (
            <Notice variant="critical">
              <strong>Missing tax information.</strong> Some invoices are not payable until contractors provide tax
              information.
            </Notice>
          )}

          <div className="flex justify-between md:hidden">
            <h2 className="text-xl font-bold">
              {data.invoices.length} {pluralize("invoice", data.invoices.length)}
            </h2>
            <Checkbox
              checked={table.getIsAllRowsSelected()}
              label="Select all"
              onChange={(checked) => table.toggleAllRowsSelected(checked)}
            />
          </div>

          <Table table={table} onRowClicked={setDetailInvoice} />
          <PaginationSection total={data.total} perPage={perPage} />
        </div>
      )}

      {!company.isTrusted && data.invoices.length > 0 && (
        <Notice variant="critical">
          <strong>Payments to contractors may take up to 10 business days to process.</strong>{" "}
          <span>
            Email us at <Link href="mailto:support@flexile.com">support@flexile.com</Link> to complete additional
            verification steps.
          </span>
        </Notice>
      )}

      {data.invoices.length === 0 && <Placeholder icon={CheckCircleIcon}>No invoices to display.</Placeholder>}

      <Modal
        open={openModal === "approve"}
        title="Approve these invoices?"
        onClose={() => setOpenModal(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpenModal(null)}>
              No, cancel
            </Button>
            <MutationButton
              mutation={approveInvoices}
              param={{
                approve_ids: selectedApprovableInvoices.map((invoice) => invoice.id),
                pay_ids: selectedPayableInvoices.map((invoice) => invoice.id),
              }}
            >
              Yes, proceed
            </MutationButton>
          </>
        }
      >
        {selectedPayableInvoices.length > 0 && (
          <div>
            You are paying{" "}
            {formatMoneyFromCents(
              selectedPayableInvoices.reduce((sum, invoice) => sum + invoice.totalAmountInUsdCents, 0n),
            )}{" "}
            now.
          </div>
        )}
        <Card>
          {selectedInvoices.slice(0, 5).map((invoice) => (
            <CardRow key={invoice.id} className="flex justify-between gap-2">
              <b>{invoice.billFrom}</b>
              <div>{formatMoneyFromCents(invoice.totalAmountInUsdCents)}</div>
            </CardRow>
          ))}
        </Card>
        {selectedInvoices.length > 6 && <div>and {data.invoices.length - 6} more</div>}
      </Modal>

      <TasksModal
        invoice={detailInvoice}
        onClose={() => setDetailInvoice(null)}
        onReject={() => setOpenModal("reject")}
      />

      <RejectModal
        open={openModal === "reject"}
        onClose={() => setOpenModal(null)}
        onReject={() => {
          if (detailInvoice) {
            setDetailInvoice(null);
          }
        }}
        ids={detailInvoice ? [detailInvoice.id] : selectedInvoices.map((invoice) => invoice.id)}
      />
    </MainLayout>
  );
}

const TasksModal = ({
  invoice,
  onClose,
  onReject,
}: {
  invoice: Invoice | null;
  onClose: () => void;
  onReject: () => void;
}) => {
  const company = useCurrentCompany();
  const isActionable = useIsActionable();
  const { data: tasks, isLoading } = trpc.teamUpdateTasks.listForInvoice.useQuery(
    {
      companyId: company.id,
      invoiceId: invoice?.id ?? "",
    },
    {
      enabled: !!invoice && invoice.invoiceType !== "other",
      staleTime: Infinity,
    },
  );

  return (
    <Modal
      open={!!invoice && !isLoading}
      onClose={onClose}
      sidebar
      className="w-110 p-3"
      title={invoice?.billFrom ?? ""}
      footer={
        invoice && isActionable(invoice) ? (
          <div className="grid grid-cols-2 gap-6">
            <Button variant="outline" onClick={onReject}>
              Reject
            </Button>
            <ApproveButton
              invoice={invoice}
              onApprove={() => {
                setTimeout(() => onClose(), 500);
              }}
            />
          </div>
        ) : null
      }
    >
      <div className="mt-4 grid gap-8">
        <StatusNotice invoice={invoice} />
        <section>
          <header className="flex items-center justify-between gap-4 text-gray-600">
            <h3 className="text-md uppercase">Invoice details</h3>
            <Button variant="link" asChild>
              <Link href={`/invoices/${invoice?.id}`}>View invoice</Link>
            </Button>
          </header>
          <Card className="mt-3">
            <CardRow className="flex justify-between gap-2">
              <div>Net amount in cash</div>
              <div>{formatMoneyFromCents(invoice?.cashAmountInCents ?? 0n)}</div>
            </CardRow>
            {invoice?.equityAmountInCents ? (
              <CardRow className="flex justify-between gap-2">
                <div>Swapped for equity ({invoice.equityPercentage}%)</div>
                <div>{formatMoneyFromCents(invoice.equityAmountInCents)}</div>
              </CardRow>
            ) : null}
            <CardRow className="flex justify-between gap-2 font-bold">
              <div>Payout total</div>
              <div>{formatMoneyFromCents(invoice?.totalAmountInUsdCents ?? 0n)}</div>
            </CardRow>
          </Card>
        </section>
        {company.flags.includes("team_updates") ? (
          <section className="min-w-0">
            <header className="mb-3 flex items-center justify-between gap-4 text-gray-600">
              <h3 className="text-md uppercase">Tasks</h3>
            </header>

            {tasks && tasks.length > 0 ? (
              <Card className="mt-3 max-w-full overflow-hidden p-4">
                <ul className="space-y-2">
                  {tasks.map((task) => (
                    <Task key={task.id} task={task} />
                  ))}
                </ul>
              </Card>
            ) : (
              <Placeholder icon={CheckCircleIcon}>No tasks to display yet!</Placeholder>
            )}
          </section>
        ) : null}
      </div>
    </Modal>
  );
};
