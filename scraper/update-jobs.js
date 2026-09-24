import fs from "fs";

const file = "jobs.json";

const jobs = JSON.parse(fs.readFileSync(file, "utf8"));

const newJob = {
  id: "demo-" + Date.now(),
  title: "Demo Government Job Update",
  organization: "Government Department",
  vacancy: "100 Posts",
  startDate: "01-01-2026",
  lastDate: "31-01-2026",
  fee: "Check Official Notification",
  qualification: "Check Official Notification",
  age: "Check Official Notification",
  applyLink: "https://www.sarkariresult.com/",
  category: "Latest Jobs",
  updatedAt: new Date().toISOString()
};

const alreadyExists = jobs.some(
  job => job.id === newJob.id
);

if (!alreadyExists) {
  jobs.unshift(newJob);
}

fs.writeFileSync(
  file,
  JSON.stringify(jobs, null, 2) + "\n"
);

console.log("Jobs saved:", jobs.length);
