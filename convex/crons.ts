import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily at 06:17 UTC, check the connected mailbox for "graduation".
crons.cron(
  "daily graduation check",
  "17 6 * * *",
  internal.gmail.checkGraduation,
  {},
);

export default crons;
