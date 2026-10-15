# Perega Projects

A practice-management web app for Perega, in Perega branding. It covers the
same ground as CMap's AEC Edition, from first enquiry to final invoice:
winning and pricing work, running projects, booking time, planning people,
billing and reporting.

It is a static site with no build step and no dependencies. Open it from any
web server:

```bash
npm start          # python3 -m http.server 8080, then open http://localhost:8080
npm test           # unit tests for the fee, WIP, estimate and forecast rules
```

It also works on GitHub Pages: publish the repository root.

## What's in it

The menu follows CMap's main sections: Dashboard, CRM, Projects, People, Time and expenses, Finance, and Reports.

| Area | What it does |
| --- | --- |
| Dashboard | Fees won, weighted pipeline, invoiced, unbilled WIP, overdue debt and utilisation for the year, by office. A "Needs attention" list (invoices to raise, late payers, late timesheets, low-margin estimates, staffing shortfalls, overdue tasks). Targets with the gap to close, invoice and forecast calendar, fees won by month. |
| My work | Your tasks across every job (board or list), follow-ups due, the projects you manage, your timesheet. |
| Pipeline | Opportunities on a board or list. Marking one won opens a project. If it has a fee estimate, the project gets the estimate's stages, budgets, dates and monthly planned billing. |
| Clients | Clients and contacts, with their projects, opportunities, invoices and activity. |
| Activities | Calls, meetings, emails and notes, and follow-ups with due dates. |
| Fee estimates | Price a job top-down (construction cost × fee %, or a lump sum split by stage %) or bottom-up (hours by grade × rate card). Shows margin against target and against similar past jobs. Templates, snapshots, approval, a printable fee proposal, and the hours it needs from each grade by month. |
| Projects | Job list with fee, % complete, hours used, invoiced, WIP and margin. Each job has stages with dates, tasks (list, board, by person), a programme (Gantt), time, billing and planned billing, costs (expenses and purchase orders), and team and planned hours with **Find people**. |
| Portfolios | Fees, earned, invoiced, WIP, hours and margin for groups of jobs: by sector, office, client, client type, manager or status. |
| People | Directory, profiles and a skills matrix. |
| Resourcing | Planned hours against each person's available hours by week, allowing for leave. |
| Leave | Allowance and balance, requests, and a team calendar. |
| Timesheets, Expenses | Weekly timesheets with submit and approval; expense claims including mileage. |
| Invoices | Raise from WIP and unbilled costs, then approve, send, record payment, print. |
| Billing | What to raise, approve, send and chase. A cash forecast that uses how each client actually pays. Clients who pay late. |
| Purchase orders | Subconsultant and supplier orders. Orders over a set amount need approval. Supplier invoices become job cost, and rechargeable ones are billed on. |
| Approvals | Timesheets, expenses, leave, draft invoices, fee estimates and purchase orders. |
| Reports | Sales won, project list, invoice and forecast calendar, WIP, utilisation, budget vs actual, aged debt, project time and expense, **staffing forecast**, **revenue calendar**, plus **custom reports** you build and save. All export to CSV. |
| Settings | Firm settings and targets, people and rates, rate cards, fee templates, skills, offices, backup and restore. |

[`docs/cmap-feature-map.md`](docs/cmap-feature-map.md) lists every CMap AEC
feature and whether it's built, partly built or not built here, and why.

## How the numbers work

The rules are pure functions with unit tests (`tests/`):
[`js/calc.js`](js/calc.js) (fees, WIP, utilisation),
[`js/estimate.js`](js/estimate.js) (fee estimates) and
[`js/forecast.js`](js/forecast.js) (staffing, cash, revenue, portfolios, finding people).

- **Time value**: hours × the person's charge rate.
- **Cost**: hours × cost rate, plus approved expenses and supplier invoices against purchase orders.
- **Earned**: on a fixed-fee stage, fee × % complete. On a time-and-materials stage, the value of the time booked. Rechargeable expenses and supplier costs are added.
- **Invoiced**: every invoice except drafts, net of VAT. **WIP** = earned − invoiced.
- **Fee estimates**:
  - Top-down fee = construction cost × fee % (or a lump sum), split by each stage's %.
  - Bottom-up fee = hours by grade × the rate card.
  - Cost = hours × the average cost rate of the people in that grade. Margin = (fee − cost) ÷ fee.
  - A template plans the hours each stage can afford at the template's target margin.
- **Forecast calendar**: past months show invoices raised. From this month on it shows planned billing, plus open opportunities × probability spread over their expected duration.
- **Staffing forecast**:
  - Demand is the hours left on live stages, by grade, spread over each stage's remaining dates. Open opportunities with a fee estimate add their hours × probability from the expected start.
  - Capacity is contracted hours less leave, at the utilisation target.
- **Cash forecast**: unpaid invoices are placed at each client's usual days to pay (from their paid invoices), or at the due date. Planned billing is assumed paid at the same pace.
- **Revenue calendar**: time-and-materials stages recognise the time booked each month. Fixed-fee stages recognise earned value in step with the hours booked.
- **Utilisation**: chargeable hours ÷ contracted hours less approved leave.

## Data

- Everything is stored in the browser's local storage, so each browser has its own copy. Use **Settings → Data** to export a backup, restore one, or move to another computer. Data saved by the first version is upgraded automatically.
- The app opens with **invented demo data**: a fictional consultancy with 12 people, 14 jobs, a year of time and invoices, fee estimates, tasks and purchase orders. Every person, client and figure is made up. **Settings → Data → Start with an empty system** clears it.
- **Signed in as** in the sidebar switches whose view you see. There are no passwords, so anyone using the browser can switch.

## Before the whole firm uses it

This version is a single-browser app. For a shared system it needs:

1. A server and database (for example SQLite or Postgres behind a small API) in place of local storage, so everyone sees the same data.
2. Sign-in with Microsoft 365, and permissions enforced on the server rather than only in the interface.
3. An import of live jobs, clients and rates from CMap exports, and a decision on how invoices reach the accounts system.

## How this was built

The aim was a working equivalent of CMap built from scratch. No CMap code,
text, images or product names are used.

The [REA](https://github.com/morluto/rea) reverse-engineering tool inspected 32
public pages on cmap.io: the AEC Edition, its plan comparison table, and the
feature pages. That gave CMap's feature list and how its modules connect. The
CMap application itself is behind a login and was not accessed. The feature map
in `docs/` records what REA found and the evidence IDs.

The branding follows CalcPad and the Perega sketch standard:
- **Colours**: rubine `#E50076`, purple `#554596`, golden `#F9B000`, dark grey `#505050`.
- **Type and logo**: Arial and the Perega logo.
- **Charts**: rubine, purple and a deepened golden (`#C98A00`). This set passes a colour-blindness check, and every chart can also be read as a table.

## Files

```
index.html             app shell
css/app.css            Perega styles
js/app.js              navigation, router, search, tooltips
js/store.js            state, saving, upgrading older saves
js/calc.js             fees, WIP, utilisation (unit tested)
js/estimate.js         fee estimates (unit tested)
js/forecast.js         staffing, cash, revenue, portfolios, finding people (unit tested)
js/seed.js             demo data generator
js/ui.js, charts.js    shared components
js/views/*.js          one file per screen
docs/                  CMap feature map
assets/                Perega logo and icon
tests/                 node --test
```
