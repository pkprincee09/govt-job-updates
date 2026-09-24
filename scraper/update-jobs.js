import fs from "fs";

const file = "jobs.json";

const jobs = JSON.parse(fs.readFileSync(file, "utf8"));

const now = new Date().toISOString();

console.log("Job updater started:", now);
console.log("Existing jobs:", jobs.length);

// अभी सिर्फ testing.
// Actual permitted job source बाद में जोड़ेंगे.

fs.writeFileSync(
  file,
  JSON.stringify(jobs, null, 2) + "\n"
);

console.log("jobs.json checked successfully.");
