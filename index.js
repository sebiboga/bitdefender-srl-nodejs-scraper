import fetch from "node-fetch";
import fs from "fs";
import { fileURLToPath } from "url";
import { validateAndGetCompany } from "./company.js";
import { querySOLR, deleteJobByUrl, upsertJobs, upsertCompany } from "./solr.js";

const COMPANY_CIF = "18189442";

const TIMEOUT = 10000;

const CSOD_SPA_URL = "https://bitdefender.csod.com/ux/ats/careersite/1/home?c=bitdefender";
const CSOD_API_URL = "https://eu-fra.api.csod.com/rec-job-search/external/jobs";
const CSOD_ORIGIN = "https://bitdefender.csod.com";

const PAGE_SIZE = 100;

let COMPANY_NAME = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function extractToken() {
  const res = await fetch(CSOD_SPA_URL, {
    headers: {
      "User-Agent": "job_seeker_ro_spider",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  if (!res.ok) {
    throw new Error(`CSOD SPA error: ${res.status}`);
  }

  const html = await res.text();
  const match = html.match(/csod\.context\s*=\s*({.*?});/);

  if (!match) {
    throw new Error("Could not extract CSOD context token from SPA page");
  }

  const context = JSON.parse(match[1]);
  const token = context.token;

  if (!token) {
    throw new Error("CSOD context has no token");
  }

  return token;
}

async function fetchJobsPage(pageNum, token) {
  const body = {
    careerSiteId: 1,
    careerSitePageId: 1,
    pageNumber: pageNum,
    pageSize: PAGE_SIZE,
    cultureId: 2,
    searchText: "",
    cultureName: "en-GB",
    states: [],
    countryCodes: [],
    cities: [],
    radius: null,
    postingsWithinDays: null,
    customFieldCheckboxKeys: [],
    customFieldDropdowns: [],
    customFieldRadios: []
  };

  const res = await fetch(CSOD_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "job_seeker_ro_spider",
      "Origin": CSOD_ORIGIN,
      "Accept": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CSOD API error ${res.status} for page=${pageNum}: ${text}`);
  }

  const data = await res.json();
  return data;
}

function parseApiJobs(apiData) {
  const requisitions = apiData?.data?.requisitions || [];
  const total = apiData?.data?.totalCount || 0;

  return {
    jobs: requisitions.map(req => {
      const location = (req.locations || []).map(loc => {
        const city = loc.city || "";
        const country = loc.country || "";
        if (city && country && country !== "RO") return `${city}, ${country}`;
        if (city) return city;
        return country;
      }).filter(Boolean);

      const url = `https://bitdefender.csod.com/ux/ats/careersite/1/home/requisition/${req.requisitionId}?c=bitdefender`;

      return {
        url,
        title: req.displayJobTitle,
        uid: req.requisitionId?.toString(),
        location,
        countryCodes: (req.locations || []).map(loc => loc.country).filter(Boolean),
        datePosted: req.postingEffectiveDate
      };
    }),
    total
  };
}

async function scrapeAllListings(testOnlyOnePage = false) {
  const allJobs = [];
  const seenUrls = new Set();
  let page = 1;
  let totalJobs = 0;
  const MAX_PAGES = 5;

  const token = await extractToken();
  console.log("Token extracted successfully");

  while (true) {
    console.log(`Fetching API page: ${page}`);
    const data = await fetchJobsPage(page, token);
    const result = parseApiJobs(data);
    const jobs = result.jobs;

    if (!jobs.length) {
      console.log(`No jobs found on page ${page}, stopping.`);
      break;
    }

    if (page === 1) {
      totalJobs = result.total;
      console.log(`Total jobs: ${totalJobs}`);
    }

    const roJobs = jobs.filter(j => j.countryCodes.includes("RO"));

    let newJobs = 0;
    for (const job of roJobs) {
      if (!seenUrls.has(job.url)) {
        seenUrls.add(job.url);
        allJobs.push(job);
        newJobs++;
      }
    }
    console.log(`Page ${page}: ${roJobs.length} Romania jobs, ${newJobs} new (total: ${allJobs.length})`);

    if (testOnlyOnePage) {
      console.log("Test mode: stopping after page 1.");
      break;
    }

    if (page >= MAX_PAGES) {
      console.log(`Max pages (${MAX_PAGES}) reached, stopping.`);
      break;
    }

    if (newJobs === 0) {
      console.log(`No new jobs on page ${page}, stopping.`);
      break;
    }

    page += 1;
    await sleep(500);
  }

  console.log(`Total unique Romania jobs collected: ${allJobs.length}`);
  return allJobs;
}

function mapToJobModel(rawJob, cif, companyName = COMPANY_NAME) {
  const now = new Date().toISOString();

  const job = {
    url: rawJob.url,
    title: rawJob.title,
    company: companyName,
    cif: cif,
    location: rawJob.location?.length ? rawJob.location : undefined,
    date: now,
    status: "scraped"
  };

  Object.keys(job).forEach((k) => job[k] === undefined && delete job[k]);

  return job;
}

async function main() {
  const testOnlyOnePage = process.argv.includes("--test");

  try {
    console.log("=== Step 1: Get existing jobs count ===");
    const existingResult = await querySOLR(COMPANY_CIF);
    const existingCount = existingResult.numFound;
    console.log(`Found ${existingCount} existing jobs in SOLR`);

    console.log("=== Step 2: Validate company via ANAF ===");
    const { company, cif, address } = await validateAndGetCompany();
    COMPANY_NAME = company;
    const localCif = cif;

    try {
      await upsertCompany({
        id: cif,
        company,
        brand: "BITDEFENDER",
        status: "activ",
        location: address ? [address] : ["București"],
        website: ["https://www.bitdefender.com"],
        career: ["https://www.bitdefender.com/ro-ro/company/careers/jobs"],
        lastScraped: new Date().toISOString().split('T')[0],
        scraperFile: "https://raw.githubusercontent.com/sebiboga/bitdefender-srl-nodejs-scraper/master/.github/workflows/scrape.yml"
      });
    } catch (err) {
      console.log(`Note: Could not upsert company to SOLR core: ${err.message}`);
    }

    const rawJobs = await scrapeAllListings(testOnlyOnePage);
    const scrapedCount = rawJobs.length;
    console.log(`📊 Jobs scraped from Bitdefender Careers: ${scrapedCount}`);

    const jobs = rawJobs.map(job => mapToJobModel(job, localCif));

    const payload = {
      source: "bitdefender.com",
      scrapedAt: new Date().toISOString(),
      company: COMPANY_NAME,
      cif: localCif,
      jobs
    };

    fs.writeFileSync("jobs.json", JSON.stringify(payload, null, 2), "utf-8");
    console.log("Saved jobs.json");

    console.log("\n=== Step 4: Upsert jobs to SOLR ===");
    await upsertJobs(payload.jobs);

    const finalResult = await querySOLR(COMPANY_CIF);
    console.log(`\n📊 === SUMMARY ===`);
    console.log(`📊 Jobs existing in SOLR before scrape: ${existingCount}`);
    console.log(`📊 Jobs scraped from Bitdefender website: ${scrapedCount}`);
    console.log(`📊 Jobs in SOLR after scrape: ${finalResult.numFound}`);
    console.log(`====================`);

    console.log("\n=== DONE ===");
    console.log("Scraper completed successfully!");

  } catch (err) {
    console.error("Scraper failed:", err);
    process.exit(1);
  }
}

export { parseApiJobs, mapToJobModel };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
