# Perega Projects

A practice-management web app for Perega, in Perega branding. It covers the
same ground as CMap: winning work, running projects, booking time, planning
people, billing and reporting.

It is a static site with no build step and no dependencies. Open it from any
web server:

```bash
npm start          # python3 -m http.server 8080, then open http://localhost:8080
npm test           # unit tests for the fee, WIP, forecast and utilisation rules
```

It also works on GitHub Pages: publish the repository root.

## What's in it

| Area | What it does |
| --- | --- |
| Dashboard | Fees won, weighted pipeline, invoiced, unbilled WIP, overdue debt and utilisation for the financial year, by office. Invoice and forecast calendar, fees won by month, projects to watch, approvals waiting, who's off. |
| Pipeline | Opportunities on a board (drag between Lead, Qualified, Proposal, Won, Lost) or as a list. Marking one won opens a new project with the next job number, or adds a stage to an existing job. |
| Clients | Clients and contacts, with their projects, opportunities and invoices. |
| Projects | Job list with fee, % complete, hours used, invoiced, WIP and margin. Each job has stages (fixed fee or time and materials), time by person, invoices and planned billing, expenses, and team and planned hours. |
| Timesheets | Weekly grid by job and stage. Submit, recall, approve or reject a week. Approved leave shows on the grid. |
| Resourcing | Planned hours against each person's available hours by week, allowing for leave. Over-capacity weeks are flagged. |
| Invoices | Raise an invoice from a job's WIP and unbilled expenses, then approve, send, record payment and print or save as PDF. |
| Expenses | Claims, including mileage at 45p a mile, with approval. Rechargeable expenses flow into WIP and invoices. |
| Leave | Allowance and balance, requests, and a team calendar. |
| Approvals | Timesheets, expense claims, leave and draft invoices waiting on a manager. |
| Reports | Sales won, project list, invoice and forecast calendar, WIP and fees, utilisation, budget vs actual hours, aged debt, and project time and expense. Every report exports to CSV. |
| Settings | Financial year start, VAT, payment terms, job and invoice numbering, people and rates, offices, backup and restore. |

## How the numbers work

The rules are in [`js/calc.js`](js/calc.js), and [`tests/calc.test.js`](tests/calc.test.js)
checks them.

- **Time value**: hours × the person's charge rate. **Cost**: hours × cost rate, plus approved expenses.
- **Earned**: on a fixed-fee stage, fee × % complete. On a time-and-materials stage, the value of the time booked. Approved rechargeable expenses are added.
- **Invoiced**: every invoice except drafts, net of VAT. **WIP** = earned − invoiced.
- **Forecast calendar**: past months show invoices raised. From this month on it shows each job's planned billing, plus open opportunities × probability spread evenly over their expected duration.
- **Utilisation**: chargeable hours (anything not on the internal job) ÷ contracted hours less approved leave.
- **Projects to watch**: a job is flagged when its hours used run more than 10 points ahead of its fixed-fee progress, when it is over its hours budget, or when it is loss-making to date.

## Data

- Everything is stored in the browser's local storage, so each browser has its own copy. Use **Settings → Data** to export a backup, restore one, or move to another computer.
- The app opens with **invented demo data**: a fictional consultancy with 12 people, 14 jobs and a year of time and invoices. Every person, client and figure is made up. **Settings → Data → Start with an empty system** clears it.
- **Signed in as** in the sidebar switches whose view you see. There are no passwords, so anyone using the browser can switch.

## Before the whole firm uses it

This version is a single-browser app. For a shared system it needs:

1. A server and database (for example SQLite or Postgres behind a small API) in place of local storage, so everyone sees the same data.
2. Sign-in with Microsoft 365, and permissions enforced on the server rather than only in the interface.
3. An import of live jobs, clients and rates from CMap exports, and a decision on how invoices reach the accounts system.

## How this was built

The aim was a working equivalent of CMap built from scratch. No CMap code, text
or images are used.

The [REA](https://github.com/morluto/rea) reverse-engineering tool was installed
to inspect cmap.io. The build environment's network policy blocked cmap.io,
cmaphq.com and perega.co.uk, so REA could not reach them. CMap's features were
taken instead from public descriptions (G-Cloud listings and review sites) and
from notes on how Perega's own CMap reports are structured. The CMap app itself sits
behind a login, so the public site would only have shown marketing pages anyway.

The branding follows CalcPad and the Perega sketch standard: rubine `#E50076`,
purple `#554596`, golden `#F9B000`, dark grey `#505050`, Arial and the Perega
logo. Charts use rubine, purple and a deepened golden (`#C98A00`), which passes
a colour-blindness check as a set. Every chart can also be read as a table.

## Files

```
index.html          app shell
css/app.css         Perega styles
js/app.js           navigation, router, search, tooltips
js/store.js         state and saving
js/calc.js          business rules (pure, unit tested)
js/seed.js          demo data generator
js/ui.js, charts.js shared components
js/views/*.js       one file per screen
assets/             Perega logo and icon
tests/              node --test
```
