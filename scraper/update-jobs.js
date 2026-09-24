import fs from "fs";
import axios from "axios";
import * as cheerio from "cheerio";

const JOBS_FILE = "jobs.json";
const SOURCE_URL = "https://www.sarkariresult.com/";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

function clean(text = "") {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadJobs() {
  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, "utf8"));
  } catch {
    return [];
  }
}

async function getPage(url) {
  const response = await axios.get(url, {
    timeout: 40000,
    headers: HEADERS,
    maxRedirects: 5
  });

  return response.data;
}

function makeId(title, url) {
  return `${title}-${url}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180);
}

function isUsefulJobLink(url, text) {
  const value = `${url} ${text}`.toLowerCase();

  if (!url.includes("sarkariresult.com")) {
    return false;
  }

  if (
    value.includes("result") &&
    !value.includes("recruitment") &&
    !value.includes("online form")
  ) {
    return false;
  }

  const keywords = [
    "online form",
    "recruitment",
    "vacancy",
    "constable",
    "assistant",
    "officer",
    "teacher",
    "engineer",
    "clerk",
    "technician",
    "apprentice",
    "mts",
    "group",
    "junior",
    "senior",
    "staff",
    "si ",
    "sub inspector",
    "forest guard",
    "stenographer"
  ];

  return keywords.some(keyword => value.includes(keyword));
}

async function getJobLinks() {
  console.log("Fetching SarkariResult homepage...");

  const html = await getPage(SOURCE_URL);
  const $ = cheerio.load(html);

  const links = [];

  $("a").each((_, element) => {
    const text = clean($(element).text());
    const href = $(element).attr("href");

    if (!href) return;

    let url;

    try {
      url = new URL(href, SOURCE_URL).href;
    } catch {
      return;
    }

    if (isUsefulJobLink(url, text)) {
      links.push({
        title: text,
        url
      });
    }
  });

  const unique = new Map();

  for (const link of links) {
    if (link.title.length >= 8) {
      unique.set(link.url, link);
    }
  }

  return [...unique.values()];
}

function extractValue(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match && match[1]) {
      return clean(match[1]).slice(0, 1000);
    }
  }

  return "";
}

function extractStartDate(text) {
  return extractValue(text, [
    /Application Begin\s*:?\s*([^\n|]+)/i,
    /Application Begin\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i
  ]);
}

function extractLastDate(text) {
  return extractValue(text, [
    /Last Date for Apply Online\s*:?\s*([^\n|]+)/i,
    /Last Date to Apply\s*:?\s*([^\n|]+)/i,
    /Last Date\s*:?\s*([^\n|]+)/i
  ]);
}

function extractFee(text) {
  return extractValue(text, [
    /Application Fee\s*:?\s*([\s\S]{0,600}?)(?=Age Limit|Eligibility|Vacancy|Important Dates|Selection Process|$)/i
  ]);
}

function extractAge(text) {
  return extractValue(text, [
    /Age Limit\s*:?\s*([\s\S]{0,500}?)(?=Application Fee|Eligibility|Vacancy|Important Dates|Selection Process|$)/i,
    /Minimum Age\s*:?\s*([^\n|]+)/i,
    /Maximum Age\s*:?\s*([^\n|]+)/i
  ]);
}

function extractVacancy(text) {
  const match = text.match(
    /(?:for|of|total)\s+([0-9][0-9,]*)\s+(?:Post|Posts|Vacancy|Vacancies)/i
  );

  if (match) {
    return match[1];
  }

  const match2 = text.match(
    /([0-9][0-9,]*)\s+(?:Post|Posts|Vacancy|Vacancies)/i
  );

  return match2 ? match2[1] : "";
}

function extractQualification(text) {
  return extractValue(text, [
    /Educational Qualification\s*:?\s*([\s\S]{20,1000}?)(?=Age Limit|Application Fee|Important Dates|Selection Process|$)/i,

    /Eligibility\s*:?\s*([\s\S]{20,1000}?)(?=Age Limit|Application Fee|Important Dates|Selection Process|$)/i,

    /Qualification\s*:?\s*([\s\S]{20,1000}?)(?=Age Limit|Application Fee|Important Dates|Selection Process|$)/i
  ]);
}

function findOfficialLinks($, baseUrl) {
  let applyLink = "";
  let notificationLink = "";
  let officialLink = "";

  $("a").each((_, element) => {
    const text = clean($(element).text());
    const href = $(element).attr("href");

    if (!href) return;

    let url;

    try {
      url = new URL(href, baseUrl).href;
    } catch {
      return;
    }

    const lower = text.toLowerCase();

    if (
      !applyLink &&
      (
        lower.includes("apply online") ||
        lower === "apply now" ||
        lower === "apply"
      )
    ) {
      applyLink = url;
    }

    if (
      !notificationLink &&
      (
        lower.includes("download notification") ||
        lower === "notification" ||
        lower.includes("notification")
      )
    ) {
      notificationLink = url;
    }

    if (
      !officialLink &&
      lower.includes("official website")
    ) {
      officialLink = url;
    }
  });

  return {
    applyLink,
    notificationLink,
    officialLink
  };
}

async function parseJob(job) {
  console.log("Reading:", job.title);

  try {
    const html = await getPage(job.url);
    const $ = cheerio.load(html);

    const bodyText = clean($("body").text());

    const links = findOfficialLinks($, job.url);

    const pageTitle =
      clean($("h1").first().text()) ||
      clean($("title").text()) ||
      job.title;

    const startDate = extractStartDate(bodyText);
    const lastDate = extractLastDate(bodyText);
    const fee = extractFee(bodyText);
    const age = extractAge(bodyText);
    const vacancy = extractVacancy(bodyText);
    const qualification = extractQualification(bodyText);

    return {
      id: makeId(pageTitle, job.url),

      title: pageTitle,

      organization: "See Official Notification",

      vacancy:
        vacancy ||
        "See Official Notification",

      startDate:
        startDate ||
        "See Official Notification",

      lastDate:
        lastDate ||
        "See Official Notification",

      fee:
        fee ||
        "See Official Notification",

      qualification:
        qualification ||
        "See Official Notification",

      age:
        age ||
        "See Official Notification",

      method: "Online",

      applyLink:
        links.applyLink ||
        job.url,

      notificationLink:
        links.notificationLink ||
        job.url,

      officialWebsite:
        links.officialLink ||
        "",

      category: "Government Jobs",

      source: "SarkariResult",

      sourceLink: job.url,

      updatedAt: new Date().toISOString()
    };

  } catch (error) {
    console.log("Failed:", job.url);
    console.log(error.message);

    return null;
  }
}

async function main() {
  console.log("======================================");
  console.log("SARKARI RESULT JOB UPDATER");
  console.log("======================================");

  const oldJobs = loadJobs();

  let links = [];

  try {
    links = await getJobLinks();

  } catch (error) {
    console.log("");
    console.log("SarkariResult is currently unavailable.");
    console.log("Keeping existing jobs.json unchanged.");
    console.log("Reason:", error.message);
    console.log("");

    return;
  }

  console.log("Job links found:", links.length);

  if (links.length === 0) {
    console.log("");
    console.log("No new job links found.");
    console.log("Keeping existing jobs.json unchanged.");
    console.log("");

    return;
  }

  const result = [];

  const jobsToProcess = links.slice(0, 30);

  for (const job of jobsToProcess) {
    const parsed = await parseJob(job);

    if (parsed) {
      result.push(parsed);
    }

    await new Promise(resolve =>
      setTimeout(resolve, 1200)
    );
  }

  for (const old of oldJobs) {
    const exists = result.some(
      job =>
        job.sourceLink === old.sourceLink
    );

    if (!exists) {
      result.push(old);
    }
  }

  const unique = new Map();

  for (const job of result) {
    unique.set(
      job.sourceLink || job.id,
      job
    );
  }

  const finalJobs =
    Array.from(unique.values()).slice(0, 100);

  fs.writeFileSync(
    JOBS_FILE,
    JSON.stringify(finalJobs, null, 2) + "\n"
  );

  console.log("======================================");
  console.log("jobs.json updated successfully");
  console.log("Total jobs:", finalJobs.length);
  console.log("======================================");
}

main().catch(error => {
  console.error("Updater failed:");
  console.error(error);
  process.exit(1);
});
