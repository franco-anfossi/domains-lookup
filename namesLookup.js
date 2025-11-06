import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const GODADDY_API_KEY = process.env.GODADDY_API_KEY;
const GODADDY_API_SECRET = process.env.GODADDY_API_SECRET;
const GODADDY_URL = process.env.GODADDY_URL || "https://api.ote-godaddy.com";

if (!GODADDY_API_KEY || !GODADDY_API_SECRET || !GODADDY_URL) {
  console.error("❌ Missing GoDaddy API credentials in .env file");
  process.exit(1);
}

const rawNames = process.argv[2];
const tldArg = process.argv[3] || ".com";
const outputFile = process.argv[4] || "available-names.json";

if (!rawNames) {
  console.error(
    "❌ Missing names. Example: node namesLookup.js apple,banana .ai,.com",
  );
  process.exit(1);
}

const names = [...new Set(rawNames.split(",").map((n) => n.trim().toLowerCase()))]
  .filter(Boolean);

if (names.length === 0) {
  console.error(
    "❌ Could not parse any names. Use a comma-separated list like name1,name2",
  );
  process.exit(1);
}

const tlds = [
  ...new Set(
    tldArg
      .split(",")
      .map((tld) => tld.trim())
      .filter(Boolean)
      .map((tld) => (tld.startsWith(".") ? tld : `.${tld}`)),
  ),
];

if (tlds.length === 0) {
  console.error(
    "❌ Could not parse any TLDs. Use a comma-separated list like .ai,.com",
  );
  process.exit(1);
}

const BATCH_SIZE = 50;
const DELAY = 2000;

const totalDomains = names.length * tlds.length;
console.log(
  `🧩 Config: ${names.length} name${names.length > 1 ? "s" : ""} | TLDs: ${tlds.join(", ")}`,
);
console.log(`🧮 ${totalDomains.toLocaleString()} total domain combinations`);

async function checkDomainsBatch(domains) {
  const url = `${GODADDY_URL}/v1/domains/available?checkType=FAST`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(domains),
  });

  if (!response.ok) {
    console.error("⚠️ API Error:", await response.text());
    return [];
  }

  const data = await response.json();
  return data.domains || [];
}

const availableByTld = {};
tlds.forEach((tld) => (availableByTld[tld] = []));

function formatPrice(price, currency) {
  if (price === undefined || price === null) return "price n/a";
  const unitPrice = (price / 1_000_000).toFixed(2);
  return `${currency || "USD"} ${unitPrice}`;
}

for (const tld of tlds) {
  console.log(`\n🔍 Checking ${tld} domains...`);

  const domainsForTld = names.map((name) => `${name}${tld}`);

  for (let i = 0; i < domainsForTld.length; i += BATCH_SIZE) {
    const batch = domainsForTld.slice(i, i + BATCH_SIZE);
    const results = await checkDomainsBatch(batch);
    for (const res of results) {
      const priceLabel = formatPrice(res.price, res.currency);
      const periodLabel = res.period ? `/${res.period}y` : "";

      if (res.available) {
        availableByTld[tld].push(`${res.domain} (${priceLabel}${periodLabel})`);
        console.log(`🟢 Available: ${res.domain} (${priceLabel}${periodLabel})`);
      } else {
        console.log(`🔴 Taken: ${res.domain} (${priceLabel}${periodLabel})`);
      }
    }

    console.log(`⏳ Processed ${i + batch.length}/${domainsForTld.length} for ${tld}`);
    if (i + BATCH_SIZE < domainsForTld.length) {
      await new Promise((r) => setTimeout(r, DELAY));
    }
  }
}

fs.writeFileSync(outputFile, JSON.stringify(availableByTld, null, 2));
console.log(`✅ Done! Results saved to ${outputFile}`);
