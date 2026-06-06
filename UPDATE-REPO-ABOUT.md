# Actualizare About repo pe GitHub

## CLI (gh)

```bash
# Descriere
gh repo edit sebiboga/bitdefender-srl-nodejs-scraper \
  --description "web scraper pentru a aduce locurile de munca de la Bitdefender in platforma peviitor.ro"

# Topics (EXACT aceste două)
gh repo edit sebiboga/bitdefender-srl-nodejs-scraper \
  --add-topic job-seeker-ro-spider --add-topic peviitor-ro
```

## Verificare

```bash
gh repo view sebiboga/bitdefender-srl-nodejs-scraper --json description,homepageUrl,repositoryTopics
```
