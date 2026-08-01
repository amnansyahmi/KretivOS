// Purchasing and Accounting share one transaction engine so supplier bills and
// payments are posted once. The pathname selects the simpler purchasing shell.
export { default } from "@/app/accounting/page";
