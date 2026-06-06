# Robots.txt Analysis — bitdefender.com

Sursa: https://www.bitdefender.com/robots.txt

## Reguli

```
User-agent: *
Disallow: /api/
Disallow: /admin/
Disallow: /account/
Allow: /
```

## Interpretare

| Cale | Accesibil? | Ce conține |
|---|---|---|
| `/` | ✅ Da | Pagina principală |
| `/ro-ro/company/careers/jobs` | ✅ Da | Lista de job-uri |
| `/api/*` | ❌ Disallowed | API intern |
| `/admin/*` | ❌ Disallowed | Admin |
| `/account/*` | ❌ Disallowed | Conturi utilizatori |

## Recomandare

- Scraperul accesează pagina de careers și API-ul Cornerstone (CSOD) — domeniu separat
- Rate limiting: 1 request per page, delay rezonabil
- User-Agent standard de browser
- Riscul de blocare este minim
