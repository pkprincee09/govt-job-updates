import fs from "fs";
import axios from "axios";
import * as cheerio from "cheerio";

const JOBS_FILE = "jobs.json";

const SOURCE_URL = "https://old.sarkariresult.com/";

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

function loadOldJobs() {
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
    headers: HEADERS
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

function isJobLink(url, text) {
  const value =
    `${url} ${text}`.toLowerCase();

  const keywords = [
    "online form",
    "recruitment",
    "vacancy",
    "job",
    "post",
    "constable",
    "assistant",
    "officer",
    "teacher",
    "engineer",
    "clerk",
    "technician",
    "apprentice",
    "mts",
    "group"
  ];

  return keywords.some(
    keyword =>
      value.includes(keyword)
  );
}

async function getJobLinks() {
  console.log(
    "Fetching SarkariResult..."
  );

  const html =
    await getPage(SOURCE_URL);

  const $ =
    cheerio.load(html);

  const links = [];

  $("a").each((_, element) => {
    const text =
      clean($(element).text());

    const href =
      $(element).attr("href");

    if (!href) return;

    let url;

    try {
      url =
        new URL(
          href,
          SOURCE_URL
        ).href;
    } catch {
      return;
    }

    if (
      !url.includes(
        "sarkariresult.com"
      )
    ) {
      return;
    }

    if (
      url === SOURCE_URL ||
      url.endsWith("/")
    ) {
      return;
    }

    if (
      isJobLink(
        url,
        text
      )
    ) {
      links.push({
        title: text,
        url
      });
    }
  });

  const unique =
    new Map();

  for (const link of links) {
    if (
      link.title.length >= 8
    ) {
      unique.set(
        link.url,
        link
      );
    }
  }

  return [
    ...unique.values()
  ];
}

function findValue(
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
      ).slice(0, 1000);
    }
  }

  return "";
}

function extractOrganization(
  text
) {
  return findValue(
    text,
    [
      /(?:organization|organisation)\s*[:\-]\s*([^\n]+)/i,

      /([A-Z][A-Za-z .&()'-]{3,100})\s*\n+\s*(?:Recruitment|Online Form|Examination)/i
    ]
  );
}

function extractVacancy(text) {
  return findValue(
    text,
    [
      /(?:total\s+)?vacancies?\s*[:\-]?\s*(\d[\d,\s]*)/i,

      /(?:no\.?\s+of\s+)?posts?\s*[:\-]?\s*(\d[\d,\s]*)/i,

      /for\s+(\d[\d,]*)\s+post/i
    ]
  );
}

function extractLastDate(text) {
  return findValue(
    text,
    [
      /last\s+date\s+for\s+apply\s+online\s*[:\-]?\s*([^\n]+)/i,

      /last\s+date\s+to\s+apply\s*[:\-]?\s*([^\n]+)/i,

      /last\s+date\s*[:\-]?\s*([^\n]+)/i
    ]
  );
}

function extractStartDate(text) {
  return findValue(
    text,
    [
      /application\s+begin\s*[:\-]?\s*([^\n]+)/i,

      /apply\s+online\s+start\s*[:\-]?\s*([^\n]+)/i,

      /online\s+form\s+start\s*[:\-]?\s*([^\n]+)/i
    ]
  );
}

function extractFee(text) {
  return findValue(
    text,
    [
      /application\s+fee\s*[:\-]?\s*([^\n]+)/i,

      /examination\s+fee\s*[:\-]?\s*([^\n]+)/i,

      /exam\s+fee\s*[:\-]?\s*([^\n]+)/i
    ]
  );
}

function extractAge(text) {
  return findValue(
    text,
    [
      /age\s+limit\s*[:\-]?\s*([^\n]+)/i,

      /minimum\s+age\s*[:\-]?\s*([^\n]+)/i,

      /maximum\s+age\s*[:\-]?\s*([^\n]+)/i
    ]
  );
}

function extractQualification(text) {
  return findValue(
    text,
    [
      /educational\s+qualification\s*[:\-]?\s*([\s\S]{10,500}?)(?=age\s+limit|application\s+fee|important\s+dates|selection\s+process|$)/i,

      /qualification\s*[:\-]?\s*([\s\S]{10,500}?)(?=age\s+limit|application\s+fee|important\s+dates|selection\s+process|$)/i,

      /eligibility\s*[:\-]?\s*([\s\S]{10,500}?)(?=age\s+limit|application\s+fee|important\s+dates|selection\s+process|$)/i
    ]
  );
}

function findOfficialLinks($) {
  let applyLink = "";
  let notificationLink = "";

  $("a").each((_, element) => {
    const text =
      clean($(element).text());

    const href =
      $(element).attr("href");

    if (!href) return;

    let url;

    try {
      url =
        new URL(
          href,
          SOURCE_URL
        ).href;
    } catch {
      return;
    }

    const lower =
      text.toLowerCase();

    if (
      !applyLink &&
      (
        lower.includes(
          "apply online"
        ) ||
        lower === "apply"
      )
    ) {
      applyLink = url;
    }

    if (
      !notificationLink &&
      (
        lower.includes(
          "download notification"
        ) ||
        lower.includes(
          "notification"
        )
      )
    ) {
      notificationLink = url;
    }
  });

  return {
    applyLink,
    notificationLink
  };
}

async function parseJob(
  job
) {
  console.log(
    "Reading:",
    job.title
  );

  try {
    const html =
      await getPage(
        job.url
      );

    const $ =
      cheerio.load(html);

    const text =
      clean(
        $("body").text()
      );

    const links =
      findOfficialLinks($);

    const title =
      clean(
        $("h1").first().text()
      ) ||
      job.title;

    const organization =
      extractOrganization(
        text
      ) ||
      "See Official Notification";

    const vacancy =
      extractVacancy(
        text
      ) ||
      "See Official Notification";

    const startDate =
      extractStartDate(
        text
      ) ||
      "See Official Notification";

    const lastDate =
      extractLastDate(
        text
      ) ||
      "See Official Notification";

    const fee =
      extractFee(
        text
      ) ||
      "See Official Notification";

    const age =
      extractAge(
        text
      ) ||
      "See Official Notification";

    const qualification =
      extractQualification(
        text
      ) ||
      "See Official Notification";

    return {
      id: makeId(
        title,
        job.url
      ),

      title,

      organization,

      vacancy,

      startDate,

      lastDate,

      fee,

      qualification,

      age,

      method:
        "Online",

      applyLink:
        links.applyLink ||
        job.url,

      notificationLink:
        links.notificationLink ||
        job.url,

      category:
        "Government Jobs",

      source:
        "SarkariResult",

      sourceLink:
        job.url,

      updatedAt:
        new Date().toISOString()
    };

  } catch (error) {
    console.log(
      "Failed:",
      error.message
    );

    return null;
  }
}

async function main() {
  console.log(
    "================================"
  );

  console.log(
    "SarkariResult Government Job Updater"
  );

  console.log(
    "================================"
  );

  const links =
    await getJobLinks();

  console.log(
    "Job links found:",
    links.length
  );

  const oldJobs =
    loadOldJobs();

  const oldMap =
    new Map(
      oldJobs.map(
        job => [
          job.sourceLink ||
          job.id,
          job
        ]
      )
    );

  const result = [];

  // First 50 job pages
  // are checked every run.
  const jobsToProcess =
    links.slice(0, 50);

  for (
    const job of jobsToProcess
  ) {
    const parsed =
      await parseJob(
        job
      );

    if (parsed) {
      result.push(
        parsed
      );
    }

    // Small delay
    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          1000
        )
    );
  }

  // Keep old jobs that
  // are not currently discovered.
  for (
    const old of oldJobs
  ) {
    const exists =
      result.some(
        job =>
          job.id === old.id
      );

    if (!exists) {
      result.push(old);
    }
  }

  // Remove duplicates
  const unique =
    new Map();

  for (
    const job of result
  ) {
    unique.set(
      job.id,
      job
    );
  }

  const finalJobs =
    [
      ...unique.values()
    ].slice(0, 100);

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
