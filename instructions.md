# Instructions

## Project Purpose

This scraper extracts job listings from Bitdefender careers page and imports them to peviitor.ro.

Target: https://www.bitdefender.com/ro-ro/company/careers/jobs

## Technologies

- **Node.js & JavaScript** - For scraping and data extraction
- **Apache SOLR** - For data storage and indexing

## Workflow Steps

1. **Start with brand** - BITDEFENDER
2. **Search in DemoANAF** - Find company by brand
3. **Get company details from ANAF** - Using CIF 18189442
4. **Validate with Peviitor** - Verify company exists
5. **Check existing jobs in SOLR**
6. **Check company status** - If inactive, stop
7. **Obtain JWT token** - From Cornerstone SPA page
8. **Scrape jobs from CSOD API** - Filter by Romania locations
9. **Transform for SOLR** - Normalize locations, fields
10. **Upsert to SOLR**

## API Endpoints

- **DemoANAF Search**: `https://demoanaf.ro/api/search?q=BRAND`
- **DemoANAF Company**: `https://demoanaf.ro/api/company/:cui`
- **Peviitor API**: `https://api.peviitor.ro/v1/company/`
- **Cornerstone CSOD**: `https://eu-fra.api.csod.com/rec-job-search/external/jobs`
- **Solr**: `https://solr.peviitor.ro/solr/job` (auth: `SOLR_AUTH`)
