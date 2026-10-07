export const SAMPLE_WORKFLOW = `# Vendor Invoice Processing (Accounts Payable)

Our AP team processes roughly 4,000 supplier invoices a month so suppliers are paid accurately and on time.

The process starts when a supplier emails a PDF invoice to the shared AP mailbox.

Steps:
1. AP clerk downloads the invoice from the mailbox and saves it to SharePoint
2. AP clerk manually keys invoice header and line data into SAP
3. SAP attempts a 3-way match against the purchase order and goods receipt
4. If there is a mismatch, the AP clerk emails the buyer in procurement to investigate
5. Invoices over $10,000 are routed to the budget owner for approval
6. Budget owner reviews and approves or rejects the invoice
7. Treasury schedules the payment run every Tuesday and Friday
8. Payment is released and the supplier is notified

Problems we see:
- Price and quantity mismatches are only discovered at the 3-way match, often 5+ days after receipt.
- Approvals sit in managers' inboxes; we only notice when suppliers chase us for late payment.
- About 12% of invoices need rework because of keying errors or missing PO numbers.
- We miss early-payment discounts because invoices are approved too late.

Data: SAP invoice and PO tables, goods receipt records, approval timestamps in the workflow log, AP mailbox metadata, supplier master data, an Excel tracker of exceptions kept by the AP lead.

We measure invoice cycle time (currently 14 days average), % paid on time (78%), exceptions per 100 invoices, and early-payment discounts captured.
`;
