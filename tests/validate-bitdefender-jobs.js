/**
 * Bitdefender Job Validator - Check and remove expired jobs
 * 
 * Validates all Bitdefender jobs from peviitor API and deletes expired (404) ones from SOLR.
 * Run: node tests/validate-bitdefender-jobs.js
 */

import fetch from "node-fetch";

// SOLR configuration
const SOLR_URL = "https://solr.peviitor.ro/solr/job/update";
const SOLR_AUTH = process.env.SOLR_AUTH;
const COMPANY_NAME = "BITDEFENDER SRL";

/**
 * Get all jobs for Bitdefender from peviitor API
 */
async function getJobs() {
  const jobs = [];
  let page = 1;

  while (true) {
    const url = `https://api.peviitor.ro/v1/search/?company=${encodeURIComponent(COMPANY_NAME)}&page=${page}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "job_seeker_ro_spider",
        "origin": "https://peviitor.ro",
        "referer": "https://peviitor.ro/"
      }
    });

    if (!res.ok) {
      throw new Error(`Peviitor API error: ${res.status}`);
    }

    const data = await res.json();

    if (!data.response?.docs?.length) {
      break;
    }

    console.log(`Page ${page}: ${data.response.docs.length} jobs`);
    jobs.push(...data.response.docs);
    page++;

    // Safety limit
    if (page > 20) {
      console.log("Safety limit reached (20 pages)");
      break;
    }
  }

  console.log(`Total jobs from peviitor: ${jobs.length}`);
  return jobs;
}

/**
 * Check if a Bitdefender CSOD job URL is still active
 */
async function checkJob(url) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent": "job_seeker_ro_spider",
        "Accept": "text/html,application/xhtml+xml"
      },
      redirect: "follow"
    });
    return { url, valid: res.ok, status: res.status };
  } catch (err) {
    return { url, valid: false, status: 0, error: err.message };
  }
}

/**
 * Delete expired jobs from SOLR
 */
async function deleteJobs(jobs) {
  const auth = Buffer.from(SOLR_AUTH).toString("base64");

  for (const job of jobs) {
    const deleteQuery = JSON.stringify({
      delete: { query: `url:"${job.url}"` }
    });

    const res = await fetch(`${SOLR_URL}?commit=true`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json",
        "User-Agent": "job_seeker_ro_spider"
      },
      body: deleteQuery
    });

    if (!res.ok) {
      console.error(`Failed to delete ${job.url}: ${res.status}`);
    } else {
      console.log(`Deleted: ${job.url}`);
    }
  }
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const shouldDelete = process.argv.includes("--delete");

  console.log("Bitdefender Job Validator");

  const jobs = await getJobs();
  console.log(`\nChecking ${jobs.length} jobs...\n`);

  let active = 0;
  let expired = [];
  let errors = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const result = await checkJob(job.url);

    if (result.valid) {
      active++;
      console.log(`✅ [${i + 1}/${jobs.length}] ${result.status} - ${job.url}`);
    } else if (result.status === 404) {
      expired.push(job);
      console.log(`❌ [${i + 1}/${jobs.length}] ${result.status} - ${job.url}`);
    } else {
      errors.push(job);
      console.log(`⚠️ [${i + 1}/${jobs.length}] ${result.status || result.error} - ${job.url}`);
    }

    // Small delay to avoid rate limiting
    if (i < jobs.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Active: ${active}`);
  console.log(`Expired: ${expired.length}`);
  console.log(`Errors: ${errors.length}`);

  if (expired.length > 0 && shouldDelete && !isDryRun) {
    console.log(`\nDeleting ${expired.length} expired jobs from SOLR...`);
    await deleteJobs(expired);
    console.log("Done.");
  } else if (expired.length > 0 && isDryRun) {
    console.log("\nDry run - no deletions performed.");
    console.log("Pass --delete flag to actually remove expired jobs.");
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
