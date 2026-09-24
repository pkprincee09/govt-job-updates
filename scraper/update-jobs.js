import fs from "fs";
import axios from "axios";
import * as cheerio from "cheerio";

const JOBS_FILE = "jobs.json";
const RSS_URL = "https://www.sarkariresult.com/feed_rss.xml";

function loadJobs() {
  if (!fs.existsSync(JOBS_FILE)) return [];

  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function clean(text = "") {
  return text
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();
}

async function getRSSJobs() {
  const response = await axios.get(RSS_URL, {
    timeout: 30000,
    headers: {
      "User-Agent": "GovtJobUpdates/1.0"
    }
  });

  const $ = cheerio.load(response.data, {
    xmlMode: true
  });

  const jobs = [];

  $("item").each((_, item) => {
    const title = clean($(item).find("title").text());
    const link = clean($(item).find("link").text());
    const description = clean($(item).find("description").text());
    const pubDate = clean($(item).find("pubDate").text());

    if (!title || !link) return;

    jobs.push({
      id: link,
      title,
      organization: "",
      vacancy: "",
      startDate: "",
      lastDate: "",
      fee: "",
      qualification: "",
      age: "",
      applyLink: link,
      category: "Latest Jobs",
      description,
      source: "SarkariResult",
      publishedAt: pubDate,
      updatedAt: new Date().toISOString()
    });
  });

  return jobs;
}

async function main() {
  console.log("Checking SarkariResult RSS...");

  const oldJobs = loadJobs();
  const newJobs = await getRSSJobs();

  const existingIds = new Set(
    oldJobs.map(job => job.id)
  );

  const freshJobs = newJobs.filter(
    job => !existingIds.has(job.id)
  );

  console.log(`RSS items found: ${newJobs.length}`);
  console.log(`New jobs found: ${freshJobs.length}`);

  const combined = [
    ...freshJobs,
    ...oldJobs
  ];

  // Keep latest 100 posts
  const finalJobs = combined.slice(0, 100);

  fs.writeFileSync(
    JOBS_FILE,
    JSON.stringify(finalJobs, null, 2) + "\n"
  );

  console.log(`jobs.json updated. Total jobs: ${finalJobs.length}`);
}

main().catch(error => {
  console.error("Updater failed:");
  console.error(error.message);
  process.exit(1);
});
