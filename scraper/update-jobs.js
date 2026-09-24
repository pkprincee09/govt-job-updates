import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
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
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
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
    timeout: 40000,
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
      .map((_, cell) => clean($(cell).text()))
      .get();

    if (cells.length < 5) return;

    const issuedDate = cells[0];
    const organization = cells[1];
    const post = cells[2];
    const method = cells[3];
    const lastDate = cells[4];

    if (!organization || !post || !lastDate) {
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
      updatedAt: new Date().toISOString()
    });
  });

  return jobs;
}

async function getAdvertisementLinks() {
  console.log("Finding advertisement PDFs...");

  const html = await getPage(WEB_ADS);
  const $ = cheerio.load(html);

  const ads = [];

  $("a").each((_, a) => {
    const text = clean($(a).text());
    const href = $(a).attr("href");

    if (!href) return;

    const url = new URL(
      href,
      WEB_ADS
    ).href;

    if (
      url.toLowerCase().includes(".pdf")
    ) {
      ads.push({
        text,
        url
      });
    }
  });

  return ads;
}

function findAdvertisement(
  organization,
  title,
  ads
) {
  const orgWords = organization
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(w => w.length >= 4);

  const titleWords = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(w => w.length >= 4);

  let best = null;
  let bestScore = 0;

  for (const ad of ads) {
    const text = (
      ad.text +
      " " +
      ad.url
    )
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ");

    let score = 0;

    for (const word of orgWords) {
      if (text.includes(word)) {
        score += 3;
      }
    }

    for (const word of titleWords) {
      if (text.includes(word)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = ad;
    }
  }

  if (!best) {
    return null;
  }

  return best;
}

async function downloadPDF(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000,
    headers: {
      "User-Agent":
        "Mozilla/5.0"
    }
  });

  return Buffer.from(response.data);
}

async function extractNormalPDFText(buffer) {
  try {
    const pdf = await pdfParse(buffer);

    return clean(pdf.text || "");
  } catch {
    return "";
  }
}

function extractOCRText(buffer) {
  const tempDir = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "govjob-"
    )
  );

  const pdfPath = path.join(
    tempDir,
    "notice.pdf"
  );

  const outputPrefix = path.join(
    tempDir,
    "page"
  );

  try {
    fs.writeFileSync(
      pdfPath,
      buffer
    );

    // Convert first 8 pages to images.
    execFileSync(
      "pdftoppm",
      [
        "-f",
        "1",
        "-l",
        "8",
        "-jpeg",
        "-r",
        "150",
        pdfPath,
        outputPrefix
      ],
      {
        stdio: "ignore"
      }
    );

    const files =
      fs.readdirSync(tempDir)
        .filter(
          file =>
            file.startsWith("page-") &&
            file.endsWith(".jpg")
        )
        .sort();

    let result = "";

    for (const file of files) {
      const imagePath =
        path.join(
          tempDir,
          file
        );

      try {
        const text =
          execFileSync(
            "tesseract",
            [
              imagePath,
              "stdout",
              "-l",
              "eng",
              "--psm",
              "6"
            ],
            {
              encoding: "utf8",
              maxBuffer:
                10 * 1024 * 1024
            }
          );

        result += "\n" + text;
      } catch {
        // Continue with next page.
      }
    }

    return clean(result);

  } catch (error) {
    console.log(
      "OCR failed:",
      error.message
    );

    return "";

  } finally {
    try {
      fs.rmSync(
        tempDir,
        {
          recursive: true,
          force: true
        }
      );
    } catch {}
  }
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (
      match &&
      match[1] &&
      clean(match[1]).length > 1
    ) {
      return clean(
        match[1]
      ).slice(0, 1500);
    }
  }

  return "";
}

function extractVacancy(text) {
  return firstMatch(text, [
    /(?:total\s+)?(?:number\s+of\s+)?vacancies?\s*[:\-]?\s*(\d[\d,\s]*)/i,

    /(?:no\.?\s+of\s+)?vacancies?\s*[:\-]?\s*(\d[\d,\s]*)/i,

    /(?:total\s+)?posts?\s*[:\-]?\s*(\d[\d,\s]*)/i,

    /(?:no\.?\s+of\s+)?posts?\s*[:\-]?\s*(\d[\d,\s]*)/i
  ]);
}

function extractAge(text) {
  return firstMatch(text, [
    /age\s+limit\s*[:\-]?\s*([^\n]{5,300})/i,

    /upper\s+age\s+limit\s*[:\-]?\s*([^\n]{5,300})/i,

    /maximum\s+age\s*(?:limit)?\s*[:\-]?\s*([^\n]{5,300})/i,

    /age\s*(?:as\s+on|cut[\s-]?off)?\s*[:\-]?\s*([^\n]{5,300})/i
  ]);
}

function extractFee(text) {
  return firstMatch(text, [
    /application\s+fee\s*[:\-]?\s*([^\n]{5,400})/i,

    /examination\s+fee\s*[:\-]?\s*([^\n]{5,400})/i,

    /exam\s+fee\s*[:\-]?\s*([^\n]{5,400})/i,

    /fee\s+(?:payable|required)\s*[:\-]?\s*([^\n]{5,400})/i
  ]);
}

function extractQualification(text) {
  return firstMatch(text, [
    /essential\s+qualification\s*[:\-]?\s*([\s\S]{20,1000}?)(?=\n[A-Z][A-Za-z ]{2,40}\s*:|\n\d+[\.\)]|\nage\s+limit|\nexperience|$)/i,

    /educational\s+qualification\s*[:\-]?\s*([\s\S]{20,1000}?)(?=\n[A-Z][A-Za-z ]{2,40}\s*:|\n\d+[\.\)]|\nage\s+limit|\nexperience|$)/i,

    /educational\s+qualifications\s*[:\-]?\s*([\s\S]{20,1000}?)(?=\n[A-Z][A-Za-z ]{2,40}\s*:|\n\d+[\.\)]|\nage\s+limit|\nexperience|$)/i,

    /qualification\s*[:\-]?\s*([\s\S]{20,800}?)(?=\n[A-Z][A-Za-z ]{2,40}\s*:|\nage\s+limit|\nexperience|$)/i
  ]);
}

async function enrichJob(
  job,
  advertisement
) {
  if (!advertisement) {
    return {
      ...job,
      fee:
        job.fee ||
        "See Official Notification",
      age:
        job.age ||
        "See Official Notification",
      qualification:
        job.qualification ||
        "See Official Notification"
    };
  }

  console.log(
    "Reading:",
    job.organization,
    "|",
    job.title
  );

  let buffer;

  try {
    buffer =
      await downloadPDF(
        advertisement.url
      );
  } catch (error) {
    console.log(
      "PDF download failed:",
      error.message
    );

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

  // First try normal PDF text.
  let text =
    await extractNormalPDFText(
      buffer
    );

  console.log(
    "Normal PDF text length:",
    text.length
  );

  // If PDF is scanned/image based, use OCR.
  if (text.length < 150) {
    console.log(
      "PDF appears scanned. Starting OCR..."
    );

    text =
      extractOCRText(
        buffer
      );

    console.log(
      "OCR text length:",
      text.length
    );
  }

  const vacancy =
    extractVacancy(text);

  const age =
    extractAge(text);

  const fee =
    extractFee(text);

  const qualification =
    extractQualification(text);

  console.log(
    "Extracted:",
    {
      vacancy,
      age: !!age,
      fee: !!fee,
      qualification: !!qualification
    }
  );

  return {
    ...job,

    vacancy:
      vacancy ||
      job.vacancy ||
      "See Official Notification",

    age:
      age ||
      job.age ||
      "See Official Notification",

    fee:
      fee ||
      job.fee ||
      "See Official Notification",

    qualification:
      qualification ||
      job.qualification ||
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
    "Government Job Updater"
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
    "PDF advertisements:",
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

  // Test first 20 jobs.
  const jobsToProcess =
    jobs.slice(0, 20);

  for (
    const job of jobsToProcess
  ) {
    const old =
      oldMap.get(
        job.id
      );

    // Only skip if all important fields
    // were already successfully extracted.
    const alreadyComplete =
      old &&
      old.notificationLink &&
      old.vacancy &&
      old.vacancy !==
        "See Official Notification" &&
      old.age &&
      old.age !==
        "See Official Notification" &&
      old.fee &&
      old.fee !==
        "See Official Notification" &&
      old.qualification &&
      old.qualification !==
        "See Official Notification";

    if (alreadyComplete) {
      result.push(old);
      continue;
    }

    const advertisement =
      findAdvertisement(
        job.organization,
        job.title,
        ads
      );

    const baseJob = {
      ...job,
      ...(old || {})
    };

    const enriched =
      await enrichJob(
        baseJob,
        advertisement
      );

    result.push(
      enriched
    );
  }

  // Keep older jobs.
  for (const old of oldJobs) {
    if (
      !result.some(
        job =>
          job.id === old.id
      )
    ) {
      result.push(old);
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

main().catch(error => {
  console.error(
    "Updater failed:"
  );

  console.error(
    error
  );

  process.exit(1);
});
