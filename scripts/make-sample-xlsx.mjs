// Generates a sample AP metrics workbook for testing ingestion: node scripts/make-sample-xlsx.mjs <out>
import * as XLSX from "xlsx";

const out = process.argv[2] ?? "sample-ap-metrics.xlsx";
const vendors = ["Acme Corp", "Globex", "Initech", "Umbrella", "Stark Supplies", "Wayne Logistics"];
const statuses = ["Paid", "Paid", "Paid", "Paid", "On hold", "Exception", "Rejected"];
const reasons = ["", "", "", "PO mismatch", "Missing GRN", "Price variance", "Duplicate"];
const day = 86400000;
const start = Date.UTC(2026, 0, 2);

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const rows = [];
for (let i = 0; i < 400; i++) {
  const received = new Date(start + Math.floor(rnd() * 240) * day);
  const status = statuses[Math.floor(rnd() * statuses.length)];
  const slow = status !== "Paid" || rnd() < 0.15;
  const approved = new Date(received.getTime() + Math.ceil(rnd() * (slow ? 25 : 6)) * day);
  const paid = status === "Paid" ? new Date(approved.getTime() + Math.ceil(rnd() * 10) * day) : null;
  rows.push({
    "Invoice ID": `INV-${10000 + i}`,
    Vendor: vendors[Math.floor(rnd() * vendors.length)],
    "Invoice Amount": Math.round(rnd() * 48000 + 200),
    "Received Date": received,
    "Approved Date": approved,
    "Paid Date": paid,
    Status: status,
    "Exception Reason": status === "Paid" ? "" : reasons[Math.floor(rnd() * reasons.length)] || "PO mismatch",
    Approver: ["J. Patel", "M. Chen", "S. Okafor"][Math.floor(rnd() * 3)],
  });
}

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet([], { origin: "A3" });
XLSX.utils.sheet_add_aoa(ws, [["AP Invoice Register — FY26 export"], []], { origin: "A1" });
XLSX.utils.sheet_add_json(ws, rows, { origin: "A3", cellDates: true });
XLSX.utils.book_append_sheet(wb, ws, "Invoices");

const sla = [
  { Month: "2026-01", "Invoices Received": 52, "On-time Payment %": 0.81, "Late Fees ($)": 1200 },
  { Month: "2026-02", "Invoices Received": 47, "On-time Payment %": 0.78, "Late Fees ($)": 1850 },
  { Month: "2026-03", "Invoices Received": 55, "On-time Payment %": 0.74, "Late Fees ($)": 2400 },
  { Month: "2026-04", "Invoices Received": 49, "On-time Payment %": 0.8, "Late Fees ($)": 1500 },
  { Month: "2026-05", "Invoices Received": 51, "On-time Payment %": 0.72, "Late Fees ($)": 2900 },
  { Month: "2026-06", "Invoices Received": 46, "On-time Payment %": 0.77, "Late Fees ($)": 2100 },
  { Month: "2026-07", "Invoices Received": 53, "On-time Payment %": 0.7, "Late Fees ($)": 3300 },
  { Month: "2026-08", "Invoices Received": 50, "On-time Payment %": 0.75, "Late Fees ($)": 2600 },
  { Month: "2026-09", "Invoices Received": 48, "On-time Payment %": 0.79, "Late Fees ($)": 1700 },
  { Month: "2026-10", "Invoices Received": 44, "On-time Payment %": 0.76, "Late Fees ($)": 2000 },
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sla), "Monthly SLA");

XLSX.writeFile(wb, out);
console.log(`wrote ${out}`);
