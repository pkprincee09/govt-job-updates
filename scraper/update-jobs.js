import fs from "fs";
import axios from "axios";
import * as cheerio from "cheerio";

const JOBS_FILE = "jobs.json";

const SOURCE =
  "https://employmentnews.gov.in/newemp/AllJobs.aspx?k=All";

function loadJobs() {
  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function clean(text = "") {
  return text.replace(/\s+/g, " ").trim();
}

async function main() {
  console.log("Checking Employment News...");

  const response = await axios.get(SOURCE, {
    timeout: 30000,
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const $ = cheerio.load(response.data);

  const jobs = [];

  $("table tr").each((index, row) => {
    const cells = $(row)
      .find("td")
      .map((_, cell) => clean($(cell).text()))
      .get();

    if (cells.length < 5) return;

    const [issuedDate, organization, post, method, lastDate] = cells;

    if (
      !organization ||
      !post ||
      !lastDate ||
      organization === "ORGANISATION"
    ) {
      return;
    }

    jobs.push({
      id: `${organization}-${post}-${lastDate}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-"),

      title: post,
      organization: organization,
      vacancy: "",
      startDate: issuedDate,
      lastDate: lastDate,
      fee: "Check Official Notification",
      qualification: "Check Official Notification",
      age: "Check Official Notification",
      applyLink: SOURCE,
      category: "Government Jobs",
      source: "Employment News",
      updatedAt: new Date().toISOString()
    });
  });

  console.log(`Jobs found: ${jobs.length}`);

  const oldJobs = loadJobs();

  const oldIds = new Set(oldJobs.map(job => job.id));

  const newJobs = jobs.filter(job => !oldIds.has(job.id));

  console.log(`New jobs: ${newJobs.length}`);

  const combined = [
    ...newJobs,
    ...oldJobs
  ].slice(0, 100);

  fs.writeFileSync(
    JOBS_FILE,
    JSON.stringify(combined, null, 2) + "\n"
  );

  console.log(
    `jobs.json updated. Total: ${combined.length}`
  );
}

main().catch(error => {
  console.error("Updater failed:");
  console.error(error.message);
  process.exit(1);
});
