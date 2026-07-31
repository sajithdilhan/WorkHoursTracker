# Shiftly

Shiftly is a mobile-friendly work schedule and earnings tracker for part-time
workers. The local pilot supports weekly planning, overnight shifts, hourly
rates, unpaid breaks, browser reminders, shift statuses, and earnings history.

## Run locally

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verify the project

```bash
npm test
```

## Current pilot behavior

- Shift and preference data is saved in the current browser.
- A sample schedule is added on first use.
- Browser reminders work while the app is open and notification permission is
  enabled.
- Earnings are estimates based on shift duration minus unpaid breaks.
- Overnight shifts are represented by an end time on the following day.

## Next backend phase

The local storage adapter will be replaced with the planned AWS serverless
backend: Cognito, API Gateway, Lambda, DynamoDB, and EventBridge Scheduler. The
web interface and shared TypeScript business rules can remain in place.
