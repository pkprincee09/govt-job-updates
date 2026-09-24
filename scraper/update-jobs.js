import fs from "fs";
import axios from "axios";
import * as cheerio from "cheerio";
import pdfParse from "pdf-parse";

const JOBS_FILE = "jobs.json";

const ALL_JOBS =
  "https://employmentnews.gov.in/newemp/AllJobs.aspx?k=All";

const WEB_ADS =
  "https://employmentnews.gov.in/newemp/MoreContentS.aspx?n=WebAdvertisement";

function clean(text = "") {
  return text
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function loadJobs() {
  try {
    return JSON.parse(
      fs.readFileSync(JOBS_FILE, "utf8")
    );
  } catch {
    return [];
  }
}

async function getPage(url) {

  const response = await axios.get(url, {
    timeout: 30000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  return response.data;
}

async function getJobs() {

  console.log("Fetching Employment News...");

  const html = await getPage(ALL_JOBS);

  const $ = cheerio.load(html);

  const jobs = [];

  $("table tr").each((_, row) => {

    const cells = $(row)
      .find("td")
      .map((_, cell) =>
        clean($(cell).text())
      )
      .get();

    if (cells.length < 5) return;

    const issuedDate = cells[0];
    const organization = cells[1];
    const post = cells[2];
    const method = cells[3];
    const lastDate = cells[4];

    if (
      !organization ||
      !post ||
      !lastDate
    ) {
      return;
    }

    if (
      organization.toLowerCase() ===
      "organisation"
    ) {
      return;
    }

    const id =
      `${organization}-${post}-${lastDate}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    jobs.push({

      id,

      title: post,

      organization,

      vacancy: "",

      startDate: issuedDate,

      lastDate,

      fee: "",

      qualification: "",

      age: "",

      method,

      applyLink: "",

      notificationLink: "",

      category: "Government Jobs",

      source: "Employment News",

      updatedAt:
        new Date().toISOString()

    });

  });

  return jobs;
}

async function getAdvertisementLinks() {

  console.log(
    "Finding advertisement PDFs..."
  );

  const html =
    await getPage(WEB_ADS);

  const $ =
    cheerio.load(html);

  const ads = [];

  $("a").each((_, a) => {

    const text =
      clean($(a).text());

    const href =
      $(a).attr("href");

    if (!href) return;

    const fullUrl =
      new URL(
        href,
        WEB_ADS
      ).href;

    if (
      fullUrl
        .toLowerCase()
        .includes(".pdf")
    ) {

      ads.push({

        text,

        url: fullUrl

      });

    }

  });

  return ads;
}

function findAdvertisement(
  organization,
  ads
) {

  const words =
    organization
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        " "
      )
      .split(" ")
      .filter(
        word => word.length >= 4
      );

  let best = null;

  let bestScore = 0;

  for (const ad of ads) {

    const text =
      ad.text
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          " "
        );

    let score = 0;

    for (const word of words) {

      if (text.includes(word)) {
        score++;
      }

    }

    if (score > bestScore) {

      bestScore = score;

      best = ad;

    }

  }

  if (
    best &&
    bestScore >=
      Math.min(2, words.length)
  ) {

    return best;

  }

  return null;
}

function extractField(
  text,
  patterns
) {

  for (
    const pattern of patterns
  ) {

    const match =
      text.match(pattern);

    if (
      match &&
      match[1]
    ) {

      return clean(
        match[1]
      ).slice(0, 1500);

    }

  }

  return "";

}

async function readPDF(
  url
) {

  try {

    console.log(
      "Reading PDF:",
      url
    );

    const response =
      await axios.get(
        url,
        {
          responseType:
            "arraybuffer",

          timeout: 30000,

          headers: {
            "User-Agent":
              "Mozilla/5.0"
          }
        }
      );

    const pdf =
      await pdfParse(
        response.data
      );

    return clean(
      pdf.text
    );

  } catch (error) {

    console.log(
      "PDF read failed:",
      error.message
    );

    return "";

  }

}

async function enrichJob(
  job,
  advertisement
) {

  if (!advertisement) {

    return {

      ...job,

      fee:
        "See Official Notification",

      age:
        "See Official Notification",

      qualification:
        "See Official Notification"

    };

  }

  const text =
    await readPDF(
      advertisement.url
    );

  if (!text) {

    return {

      ...job,

      notificationLink:
        advertisement.url,

      applyLink:
        advertisement.url,

      fee:
        "See Official Notification",

      age:
        "See Official Notification",

      qualification:
        "See Official Notification"

    };

  }

  const vacancy =
    extractField(
      text,
      [
        /total\s+vacanc(?:y|ies)\s*[:\-]?\s*([0-9,]+)/i,

        /total\s+posts?\s*[:\-]?\s*([0-9,]+)/i,

        /number\s+of\s+vacanc(?:y|ies)\s*[:\-]?\s*([0-9,]+)/i
      ]
    );

  const age =
    extractField(
      text,
      [
        /age\s+limit\s*[:\-]?\s*([^.;]{5,500})/i,

        /maximum\s+age\s*[:\-]?\s*([^.;]{5,500})/i
      ]
    );

  const fee =
    extractField(
      text,
      [
        /application\s+fee\s*[:\-]?\s*([^.;]{5,500})/i,

        /examination\s+fee\s*[:\-]?\s*([^.;]{5,500})/i,

        /fee\s+payable\s*[:\-]?\s*([^.;]{5,500})/i
      ]
    );

  const qualification =
    extractField(
      text,
      [
        /educational\s+qualification\s*[:\-]?\s*([^.;]{20,1500})/i,

        /essential\s+qualification\s*[:\-]?\s*([^.;]{20,1500})/i,

        /educational\s+qualifications\s*[:\-]?\s*([^.;]{20,1500})/i
      ]
    );

  return {

    ...job,

    vacancy:
      vacancy ||
      "See Official Notification",

    fee:
      fee ||
      "See Official Notification",

    age:
      age ||
      "See Official Notification",

    qualification:
      qualification ||
      "See Official Notification",

    notificationLink:
      advertisement.url,

    applyLink:
      advertisement.url,

    updatedAt:
      new Date().toISOString()

  };

}

async function main() {

  console.log(
    "================================"
  );

  console.log(
    "Government Job Updater Started"
  );

  console.log(
    "================================"
  );

  const jobs =
    await getJobs();

  console.log(
    "Jobs found:",
    jobs.length
  );

  const ads =
    await getAdvertisementLinks();

  console.log(
    "PDF advertisements found:",
    ads.length
  );

  const oldJobs =
    loadJobs();

  const oldMap =
    new Map(
      oldJobs.map(
        job => [
          job.id,
          job
        ]
      )
    );

  const result = [];

  // First 20 jobs = safe test
  const jobsToProcess =
    jobs.slice(0, 20);

  for (
    const job of jobsToProcess
  ) {

    const old =
      oldMap.get(
        job.id
      );

    if (
      old &&
      old.notificationLink
    ) {

      result.push(
        old
      );

      continue;

    }

    console.log(
      "Processing:",
      job.organization,
      "-",
      job.title
    );

    const advertisement =
      findAdvertisement(
        job.organization,
        ads
      );

    const enriched =
      await enrichJob(
        job,
        advertisement
      );

    result.push(
      enriched
    );

  }

  // Keep older jobs after current jobs
  for (
    const old of oldJobs
  ) {

    if (
      !result.some(
        job =>
          job.id === old.id
      )
    ) {

      result.push(
        old
      );

    }

  }

  const finalJobs =
    result.slice(0, 100);

  fs.writeFileSync(
    JOBS_FILE,

    JSON.stringify(
      finalJobs,
      null,
      2
    ) + "\n"
  );

  console.log(
    "================================"
  );

  console.log(
    "jobs.json updated successfully"
  );

  console.log(
    "Total jobs:",
    finalJobs.length
  );

  console.log(
    "================================"
  );

}

main().catch(
  error => {

    console.error(
      "Updater failed:"
    );

    console.error(
      error
    );

    process.exit(1);

  }
);
