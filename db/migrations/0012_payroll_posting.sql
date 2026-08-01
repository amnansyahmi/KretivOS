-- Payroll reaches the ledger.
-- Apply after 0011_unify_cash_and_settlements.sql.
--
-- HR payroll wrote into its own state blob and stopped there, so the largest
-- expense a small agency has was entirely absent from the accounts: the profit
-- and loss understated costs by the whole wage bill, and EPF, SOCSO, EIS and PCB
-- liabilities did not exist on the balance sheet — money owed to the government
-- with nothing recording it.
--
-- The payroll records themselves stay in the HR blob, where they are role-gated
-- and employee-facing. Only the money moves here.

-- 6010 was seeded without a role key, so nothing could post to it by name.
update ledger_accounts
set system_key = 'employer_statutory'
where organization_id = 'org-kretivco'
  and code = '6010'
  and system_key is null
  and not exists (
    select 1 from ledger_accounts other
    where other.organization_id = 'org-kretivco' and other.system_key = 'employer_statutory'
  );

-- Employee deductions and employer contributions are owed to different bodies on
-- different dates. Splitting them out of the single payroll liability lets the
-- balance sheet say who is owed what, and lets each be cleared as it is remitted.
insert into ledger_accounts (organization_id, code, name, type, subtype, system_key, description)
values
  ('org-kretivco', '2310', 'EPF payable', 'liability', 'Payroll', 'epf_payable',
   'Employee and employer EPF withheld, not yet remitted.'),
  ('org-kretivco', '2320', 'SOCSO and EIS payable', 'liability', 'Payroll', 'socso_payable',
   'Employee and employer SOCSO and EIS withheld, not yet remitted.'),
  ('org-kretivco', '2330', 'PCB payable', 'liability', 'Payroll', 'pcb_payable',
   'Monthly tax deduction withheld from staff, not yet remitted to LHDN.')
on conflict (organization_id, code) do nothing;
