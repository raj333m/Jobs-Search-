# Job Compass

A résumé and job-description matching console following the 20-column format in the Regulatory BA Job Alerts report. Upload PDF, DOCX or TXT résumés, paste a vacancy, import a JSON array, or refresh a configured job feed. Filter at 75% by default, review all supplied recruiter/referral fields, practise vacancy-specific interview prompts, and export CSV.

## Run locally

Requires Node.js 22.9 or newer.

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Open http://localhost:3000. Run `npm test` for matching and export checks.

## LinkedIn and Naukri

LinkedIn OAuth authorization and basic identity retrieval are implemented. Create a LinkedIn developer application, enable **Sign In with LinkedIn using OpenID Connect**, configure `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` in `.env`, and register `http://localhost:3000/auth/linkedin/callback` (or your exact APP_URL callback). Restart the server after changes. This integration has not been tested with live credentials.

LinkedIn basic sign-in does not import a résumé, job listings, or connections. Those need separately approved products/access. See https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access and https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2 .

Naukri currently has a profile shortcut and saved profile URLs, not authenticated account syncing. No verified public jobseeker API was identified. Do not collect users' LinkedIn/Naukri passwords. Add an authorised provider integration when available.

## Populating matching jobs

Paste a full JD or import JSON with `title`, `company`, `location`, `posted`, `description`, `applyLink` and optional fields shown in [examples/jobs.json](examples/jobs.json). The example is clearly labelled and is never loaded automatically. Unknown recruiter and referral data remain blank; connection degrees are never inferred.

For an authorised feed, configure a trusted `JOB_FEED_URL` (HTTPS) and optionally `JOB_FEED_TOKEN`. Its response must be an array using the same schema. Refreshing calls this feed server-side and matches returned descriptions locally. This app does not scrape LinkedIn or Naukri and does not yet offer autonomous job discovery.

The application retains the existing report columns without displaying the schedule card. This version runs manually; it does not create or modify the existing scheduled task, send alerts, or run a background scheduler.

## Matching and interview limits

Scores are deterministic recognised-skill coverage: matched JD skills divided by all recognised JD skills, equally weighted. The vocabulary is in `matching.js`. It does not determine seniority, negation, years of experience, mandatory versus optional requirements, or work eligibility. Unrecognised descriptions are unscored. Scores are not hiring probabilities. Review the actual JD before applying.

Mock interview questions are skill-based templates, not an AI assessment of the candidate's specific work history. Résumé examples must come from the candidate. No ElevenLabs integration is active.

The CSV preserves: Match %, Status, Company, Job Title, Location, Posted, Skills Matched, Gaps, Apply Link, Recruiter, Recruiter Role, Email, Recruiter LinkedIn, Your Referral Contact, Contact Role, Connection, Why Relevant, Contact LinkedIn, Recommended Action, Mock Interview. Export includes scored vacancies at the selected minimum threshold, independent of the text search. New/Reviewed refers to this browser session.

## Data handling and deployment

The server binds to localhost. Each browser has a separate random HttpOnly session cookie. Résumé text, vacancies and LinkedIn basic identity stay in server memory; raw uploaded files and OAuth access tokens are not saved. Sessions expire after 24 hours of inactivity and are lost on restart. Profile shortcuts stay only in the current page. Clear session data removes the active candidate's data. Scanned PDFs need a text-based export; there is no OCR.

This is a local MVP. Before public deployment add a durable database with deletion/retention controls, application authentication, rate limiting, hardened file parsing, robust job ingestion, persistent scheduling, and HTTPS. Set APP_URL to the exact external origin and configure an appropriate reverse proxy/network binding. Keep `.env` private.

## Candidate input and Submit flow

The candidate panel has a résumé upload, a minimum match selector (25%, 50%, 75%, or 100%), Submit and Refresh. The percentage is a minimum: selecting 50% includes scores from 50% through 100%. Changing the selection takes effect after Submit or Refresh. Uploading a replacement résumé or adding/importing vacancies requires another Submit.

Submit retrieves the configured feed if present and lists matching vacancies in a horizontally scrollable table with all 20 scheduler columns. Refresh retrieves the feed again and recalculates using the current selection. Without a feed, both buttons operate on added/imported vacancies and explicitly explain that live LinkedIn/Naukri jobs are not connected. Unscored jobs are excluded. CSV uses the last submitted threshold, independently of the text search.

The job-description form is optional and collapsed by default. The primary panel highlights LinkedIn and Naukri connections, explicitly distinguishing basic LinkedIn identity sign-in from authorised job data access. Naukri Connect explains that an authorised integration is required; it does not simulate an account connection.

## Connection-first workflow

The primary flow is now vertical: upload résumé → successful-upload confirmation → connect job sources → choose minimum match → Submit/Refresh. Source connection buttons are disabled before a résumé upload. Submit and Refresh stay hidden until the résumé is ready and a job feed is configured. Basic LinkedIn identity sign-in and saved profile shortcuts do not unlock job searching. Direct LinkedIn and Naukri job integrations remain pending authorised access; a configured generic feed is identified as a feed, not as either platform connection.

The optional collapsed JD form has its own Match this description action and can match manually supplied/imported vacancies without connecting a feed. This supersedes the earlier instruction to Submit after manually adding or importing vacancies.

## Record limits and decision history

Choose 0–15 maximum records (default 15). A selection of 0 intentionally displays no records; no matches also displays a count of 0. Matching records are sorted by descending score, filtered before the limit is applied, and CSV exports use the same threshold, maximum, and text search. Both the browser and server enforce the maximum of 15.

Mark Seen or Mark Applied directly in a row's Status cell or in the vacancy details. Either action removes the vacancy from available results and future imports/feed refreshes. Merely opening a vacancy or application link does not mark it. Mark Applied records the user's decision; it does not submit an application to a job site.

Decisions are stored locally in `data/decisions.json`, which is ignored by Git. Only a hash identifying the browser, a hash identifying the vacancy, its decision and timestamp are saved; résumé contents are not persisted. A separate persistent HttpOnly browser cookie identifies this history for up to a year. History survives server restarts and Clear session data. Clearing browser cookies or using a different browser/device creates a separate history; cross-device account synchronisation is not implemented.

Vacancies are identified by canonical application URL, LinkedIn job ID, or supplied provider + job ID. When neither URL nor ID is supplied, company/title/location identify the vacancy; distinct jobs with identical fallback fields cannot be distinguished, so supply a stable application link or ID. Updated descriptions and common tracking parameters do not reintroduce decided vacancies. Existing Reviewed markers from the earlier in-memory version are not migrated.

## Current Submit / Refresh controls

The optional job-description form has been removed. Submit and Refresh now occupy its former position, after job sources and search settings. Submit remains disabled until the résumé and a configured job-data feed are available; Refresh remains available to reset the workspace.

Refresh now resets rather than retrieves a feed: it clears the session résumé, vacancies and LinkedIn identity; empties profile shortcuts and text search; restores 75% match and 15 records; closes open details; and clears the results. Persistent Seen/Applied decisions and server feed configuration remain intact. Submit retrieves the configured feed and runs a new search. These rules supersede the earlier optional-form and Refresh-as-feed descriptions.

## Visual design and themes

The interface now uses a bright blue-and-white design informed by Naukri's public homepage: horizontal navigation, a bold hero heading, rounded controls, generous spacing and clear cards. Choose Light, Dark or Colourful using the theme buttons at the top. The selected theme is stored in this browser and survives navigation or reloads. Refresh resets search data without resetting the visual theme. Responsive desktop/mobile layouts, keyboard focus indicators and reduced-motion support are included. No external fonts or trackers were added.

## Sample review data

Use View sample résumé & output to enter a clearly labelled demo. A fictional Business Analyst résumé and four fictional vacancies demonstrate 100%, 75%, 64%, and 50% matches calculated by the same matching engine. The default 75% filter shows two records; choose 50% and Submit to show all four. Demo decisions stay in page memory and never modify real decision history. Exit demo or Refresh restores the real workspace without clearing its data. Uploading a real résumé exits the demo first.

Sample résumé download is available in the page. Standalone examples are `examples/sample-resume.txt`, `examples/sample-output.csv`, and `examples/sample-output.json`. All contacts use fictional names and example.com emails; no real application URLs or platform connections are simulated. CSV export of real data is hidden during demo mode; the static sample CSV is supplied separately for review.

## Location preferences and fresh open vacancies

Select multiple Indian cities, including Pune, Delhi, Gurgaon and Noida. Overseas dropdowns cover popular regions/cities in the United States, United Kingdom, Canada, Australia, UAE, Singapore, Germany and Ireland. The custom country/state/city fields support places outside this curated list. Add several locations; any selected city can match. Empty preferences mean all locations. Gurgaon and Gurugram, Bangalore and Bengaluru, and Delhi and New Delhi are treated as aliases. For overseas filtering supply structured `country`, `state`, and `city` in the feed; country is checked to avoid confusing cities sharing a name. Preferences apply on Submit and reset on Refresh.

Every returned vacancy must explicitly have `applicationOpen: true` or `applicationStatus: "open"`, plus a valid ISO `postedAt` or `posted` date. Explicit closed status overrides open. An optional `closesAt` date is enforced. Unknown dates/status, future postings, expired deadlines and older postings are excluded. New now means open for applications and posted between the user's current local date and one calendar month earlier (inclusive), with month-end clamping. For example, on 4 October 2026 the window is 4 September–4 October 2026. The browser sends its local date; API requests without one default to India time. No historical status is inferred from a listing's existence; the provider must keep its open/closed flag current.

The report's former Posted column is now labelled Posting Date, retaining the same 20-column position, with YYYY-MM-DD values. Results and CSV use identical date, location, match, decision and record-limit filters. Demo posting dates are generated relative to the viewer's local date and remain fictional.

## Mandatory inputs

A résumé, a minimum match percentage, an explicit record count (0–15), and at least one preferred city are required. Default match/count values remain valid selections. LinkedIn and Naukri are individually optional, but at least one authorised provider job-data integration is required for a real search. Basic identity sign-in, saved profile URLs and a generic unlabelled job feed do not fulfil this requirement. Configure `JOB_FEED_SOURCE=linkedin` or `naukri` only for an authorised feed supplying that provider's vacancies; this setting does not create an integration or verify access by itself.

Required badges and a completion checklist show missing inputs, and Submit remains disabled until they are complete. Server-side feed validation also requires the match threshold, count and location list. The fictional demo explicitly bypasses real connection requirements and preloads sample location preferences for review.

## Export formats and match explanations

The output provides Export CSV, Excel (.xlsx) and PDF. All formats use the same submitted threshold, record limit, location preferences, date window and text search, excluding decided vacancies. Demo exports are labelled sample and use fictional data only. Excel preserves all 20 columns with wrapping, frozen headings and numeric percentages; percentage cells include explanatory notes. PDF presents complete vacancy records and interview preparation across readable pages rather than squeezing 20 columns into one page.

Hover on a match percentage for a text explanation, or click it to open the same reasoning in vacancy details (also accessible by keyboard/touch). It shows recognised résumé skills, recognised JD requirements, matched skills, gaps, matched/required counts and rounded percentage. It also explains listing filters and sorting. These are deterministic regex-based skill coverage scores; no ChatGPT/LLM assessment runs. Skills have equal weight, with no assessment of years, seniority, negation, required-versus-optional status or eligibility.

## Job designation preferences

The form includes multi-select Job Designation checkboxes and a custom designation field. You can add/remove several roles. Empty selection includes all roles; any selected designation can match the job title. Matching is case-insensitive, ignores punctuation, accepts seniority prefixes and treats BA as Business Analyst. It is title-text filtering, not a full occupational taxonomy. Preferences apply on Submit and affect results and all exports. Refresh clears them.

## Candidate experience inputs

Total years of professional experience is available in the user form. Each selected designation, including custom designations, adds its own Relevant years input. Decimal years and 0 for freshers are accepted. These additional fields are optional; if relevant experience is provided, total experience is needed and each relevant value must be between 0 and total years (maximum 80). Overlapping experience can apply to several roles, so per-role values are not summed. Refresh clears these inputs.

The values accompany the submitted candidate preferences. They do not alter the recognised-skill coverage score or automatically infer years required from free-text JDs. Experience requirements still need manual review.

## Optional package bucket

Annual INR package buckets range from below ₹5 lakh to ₹50 lakh and above. Any package is the default. Selection applies on Submit to results and exports, without changing the skill-match percentage. A vacancy must advertise a numeric `salaryMin` and `salaryMax` (annual rupees), `salaryCurrency: "INR"`, and `salaryPeriod: "annual"`; salary ranges must overlap the bucket. Unknown salaries, different currencies and monthly amounts are excluded when a bucket is selected. Bucket upper bounds are exclusive; a fixed ₹20 lakh package belongs to ₹20–30 lakh. Salary is not inferred from free text. Refresh restores Any package. Fictional demo vacancies include salary ranges for trying this filter.

## Optional business verticals

Multi-select Business Verticals include Banking, Retail, Pharma, Healthcare, Logistics, Aerospace and additional sectors. Empty selection includes all industries. Selected verticals apply on Submit to results and all exports, using feed `businessVerticals` (a string array) or `industry` (a string). Any selected vertical may match. Unknown industry data is excluded when filtering; industry is not guessed from a company name. Pharma/Pharmaceuticals and Healthcare/Health care aliases are recognised. Skill-match percentages are unaffected. Refresh clears the selections; fictional demo roles use Banking.

Outreach emails: each vacancy with a valid supplied email (email or contactEmail) includes an editable draft using skills identified in both the uploaded résumé and vacancy. Open vacancy details or click Draft outreach email. Copy the draft or open the candidate's email app; complete placeholders and attach the résumé manually. The application never sends emails automatically. Missing contact emails are not guessed. Demo contact addresses are fictional.

LinkedIn data provider investigation: job-provider.js implements TheirStack POST /v1/jobs/search using selected designations, city patterns and recent posting dates, and retains only LinkedIn job source URLs. It is not activated in Submit yet. A provider API key, appropriate display rights and a solution for confirmed-open status are required. The provider's closed_at=null means open OR unknown, so the adapter deliberately does not certify those listings as open. Tests use fixture data, not live results. Documentation: https://api.theirstack.com/openapi.json
# Official bank careers pilot

As of 7 October 2026, six additional live-tested sources are available: Genpact,
FIS, Fiserv, Mastercard, Salesforce and Adobe. All returned recent India vacancies
whose official application system explicitly confirmed posted/canApply. The form
contains ten tested employers in total; new employers are unchecked initially so
the user can choose which sources to query. Saved live retrieval evidence is in
`examples/additional-employer-verification.json`. Counts describe source retrieval,
not matches to the user's resume or a guarantee of hiring. Each run still applies
selected role/city, skill threshold, dates, record cap and decision exclusions.

Current visible source list: **Barclays, Deutsche Bank, Citi and PwC only**.
Unverified companies and HSBC were removed from the selectable list at the user's
request. Legacy account integrations are hidden; only tested employer sources
are offered in the form. Earlier assessment notes below describe historical work.

## Big Four and IT services source list

The employer selector also includes Deloitte, PwC, EY, KPMG, TCS, Wipro, Infosys
and HCLTech. **PwC is enabled for live retrieval**, with supported selected-city
facets from its public Workday search and explicit India/posted/canApply checks.
Live verification on 5 October 2026 retrieved 20 recent application-ready India
vacancies and four matches for the test resume and Business Analyst/Consultant
preferences. Professional Services and Consulting are available industry filters.

The other seven are **not connected**. Their official portals were inspected, but
reliable search, dates and independent application-open verification have not all
been established. They appear as disabled search selections with official career
links, not as working feeds. The full requested employer list is represented; live
integration of all eight is not complete. `employer-sources.js` records the status
and verified official entry point for each employer. Never infer successful
integration merely from an HTTP 200 response, an Apply button or a careers URL.

The working pilot now includes **Barclays, Deutsche Bank and Citi**. Deutsche Bank
and Citi use their public Workday careers search with the India country facet.
Their detail records must explicitly have `country.descriptor: India`,
`posted: true` and `canApply: true`. Descriptions and actual posting dates feed the
existing résumé matching engine. No candidate résumé or credentials are sent to
these sources. Live tests on 5 October 2026 retrieved 16 recent Deutsche Bank jobs
and 14 recent Citi jobs for a Business Analyst search; each supplied three matches
after the test résumé, designation and selected-city filters were applied.
These counts are observations, not guaranteed future results.

The form now offers Barclays and HSBC without requiring a LinkedIn/Naukri login.
Submit calls `/api/bank-search`; no résumé or credentials are sent to either bank.
Barclays public search and JobPosting metadata supply vacancy details. Its public
application system must return both `posted: true` and `canApply: true` before a
vacancy is included. HSBC search discovery and structured descriptions work, but
HSBC jobs remain excluded until application-open status can be independently
verified. Metadata expiry dates and Apply buttons are insufficient.

This is a limited, unofficial public-page pilot, not a contracted API integration.
It checks the first search page for up to four cities and two designations, and
at most 30 vacancy pages per bank. Changes to those sites can interrupt retrieval.
Posting dates, location/designation preferences, match threshold, record cap and
Seen/Applied exclusions still apply. Unknown salary excludes a vacancy when a
salary bucket is selected. Each run replaces previous bank results so a removed
vacancy cannot linger. The app displays retrieval warnings and pilot coverage.

Verified locally on 5 October 2026: Barclays returned seven recent vacancies with
application-open flags for the Full Stack Developer search; final matching and
location filters determine which are shown. HSBC retrieval works but open-status
verification is pending. NatWest direct retrieval returned HTTP 403.
