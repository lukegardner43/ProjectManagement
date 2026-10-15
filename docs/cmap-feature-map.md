# CMap feature map

This compares CMap's AEC Edition with Perega Projects, feature by feature.

## How the CMap feature list was gathered

The list was gathered with [REA](https://github.com/morluto/rea) 6.5.0
(`rea inspect-web-page` with accessibility text, and `rea capture-web-screenshot`).
REA ran against 32 public pages on www.cmap.io on 15 October 2026:

- the AEC Edition overview
- the plan comparison for architects and engineers
- the feature pages for CRM, job costing, timesheets, resourcing, task management, project management, project accounting, dashboards and reports
- the product pages for portfolios and workflow
- CMap Intelligence

Most of the rows below come from the "Compare features" table on the plans page.

Only public marketing pages were inspected. The CMap application sits behind a
login (id.cmaphq.com) and was not accessed, so nothing here describes CMap's
screens beyond what its marketing screenshots show. No CMap code, text, images
or names of CMap-specific features are used in this app. Where CMap has a
branded feature, this app uses a plain description of the same idea, for example
"Fee estimates" and "Staffing forecast".

Status: **Built**, **Partly** (some of it, with what's missing noted), or **Not built** (with why).

## Win work

| CMap feature | Status | In Perega Projects |
|---|---|---|
| Companies and contacts | Built | Clients |
| 360° account profiles | Built | Client page: projects, opportunities, invoices, activity, contacts |
| Global search | Built | Search bar (press `/`) |
| Leads | Partly | "Lead" stage on the pipeline; no separate leads list |
| Pipeline | Built | Pipeline board and list, weighted by probability |
| Activities and follow-up reminders | Built | Activities; follow-ups on My work and the dashboard |
| Groups and tags | Not built | |
| Fee estimating (job costing) | Built | Fee estimates: top-down (construction cost × fee %, or lump sum) or bottom-up (hours by grade × rate card) |
| Rate cards | Built | Settings → Rate cards |
| Estimate templates | Built | Settings → Fee templates (stage %, weeks, grade mix, target margin) |
| Estimate snapshots | Built | Save snapshot on any estimate |
| Estimate approval | Built | Submit, approve, send back; Approvals → Fee estimates |
| Proposal documents | Partly | Printable fee proposal; no editable Word templates |
| Project extensions | Built | Stages & fees → Estimate extra work, then add its stages to the job |
| Stage tagging | Not built | |
| Targets and gap analysis | Built | Dashboard → Targets (set in Settings → Firm) |
| Marketing campaigns, web forms | Not built | Outside the brief |

## Deliver profitably

| CMap feature | Status | In Perega Projects |
|---|---|---|
| Timesheets and expenses | Built | Weekly grid with submit, approve and reject; expense claims with mileage |
| Supplier cost tracking | Built | Purchase orders: committed and invoiced cost per job |
| Live budget vs actuals | Built | Project overview and Stages & fees; Budget vs actual report |
| Progress % | Built | % complete per fixed-fee stage drives earned value and WIP |
| Resource allocation | Built | Resourcing heatmap; planned hours per job on Team & resourcing |
| Project to-dos, assigned to people | Built | Tasks per stage: list, board by status, board by person |
| List, Gantt and calendar views | Partly | List, board and Programme (Gantt of stages and tasks); no calendar view |
| Automated task templates | Not built | |
| Project manager dashboard | Partly | My work → Projects I manage, plus each project's overview |
| Project worker dashboard | Built | My work: tasks, follow-ups, timesheet |
| Project tracking and profitability reports | Built | WIP and fees, Budget vs actual, Portfolios |

## Get paid and forecast cash

| CMap feature | Status | In Perega Projects |
|---|---|---|
| Invoice scheduling | Built | Planned billing per stage; generated from fee estimate dates when a job is won |
| Invoicing and forecast calendar | Built | Dashboard chart and report |
| Invoice approval workflow and reminders | Built | Draft → approved → sent → paid; Approvals and Billing pages |
| Invoice creation, T&M invoicing | Built | Raise invoice from each stage's WIP and unbilled expenses |
| Client purchase order tracking | Built | Order number on the project and invoice |
| Purchase order creation, limit approvals | Built | Purchase orders over a set amount need a manager |
| What to raise, send and chase | Built | Billing page |
| Cash forecast from how clients actually pay | Built | Billing → Cash forecast and expected payment dates; clients who pay late |
| Accounting integration (Xero, Sage, QuickBooks) | Not built | CSV exports only; needs a server |
| Progress-based WIP | Built | |
| Revenue recognition and revenue calendar | Built | Revenue calendar report |

## People and resourcing

| CMap feature | Status | In Perega Projects |
|---|---|---|
| Staffing prediction from live and pipeline work | Built | Staffing forecast report: demand by grade and month against capacity, with shortfalls |
| Employee cost rates | Built | Settings → People and rates |
| Time off booking and approval | Built | Leave |
| People profiles | Built | People |
| Skills matrix | Built | People → Skills matrix |
| Recommending people for a job | Built | Team & resourcing → Find people (skills, availability, cost) |
| Workload and resource schedules | Built | Resourcing; Team & resourcing |
| Utilisation reports | Built | Utilisation report |
| Estimate fees from resourcing | Built | Bottom-up fee estimates |
| HR documents | Not built | Needs file storage on a server |
| Associates (external people) | Partly | Subconsultants as purchase orders; not as people with timesheets |

## Reporting and administration

| CMap feature | Status | In Perega Projects |
|---|---|---|
| Out-of-the-box dashboards and reports | Built | Dashboard, 10 reports, all exportable to CSV |
| Portfolios | Built | Portfolios by sector, office, client, client type, manager or status |
| Custom report builder | Partly | Custom reports over projects, invoices, time, opportunities and expenses, saved for everyone; no custom dashboards |
| Direct data access (Excel, Power BI) | Partly | CSV exports and a full JSON backup; no live database connection |
| Rule-based prompts on the dashboard | Built | "Needs attention": invoices to raise, late payers, late timesheets, low-margin estimates, staffing shortfalls, overdue tasks and follow-ups |
| AI chat and agents | Not built | The prompts above are rules over the data, not AI |
| Project automation when dates slip | Not built | |
| Custom fields and pages | Not built | |
| Multiple entities and currencies | Not built | One company, pounds sterling |
| Private projects, security groups, SSO, IP limits | Not built | Needs a server and sign-in |
| Outlook add-in, mobile app, API | Not built | |
| Documents, drawings and email filing | Not built | A separate CMap product |
| Company branding | Built | Perega logo and colours |

## REA evidence

Each REA run produced an evidence record. A few of the IDs, for reference:

| Page | Evidence ID (prefix) |
|---|---|
| /en-gb/architects-engineers/plan | ev_d61171fc16483b89e |
| /en-gb/cmap-aec-edition | ev_336f5d25df835060e |
| /en-gb/features/job-costing-for-architecture-and-engineering-firms | ev_bec744435bf18361a |
| /en-gb/features/resourcing | ev_10f2b061286000a85 |
| /en-gb/features/task-management | ev_b64a3433a850f04eb |
| /en-gb/features/project-accounting | ev_58e20344fe0df7373 |
| /en-gb/product/portfolios | ev_22d39f36d9a061a33 |
| /en-gb/cmap-intelligence | ev_f906872c69bc53193 |

The evidence itself (page text and screenshots) is CMap's content, so it is not
kept in this repository.
