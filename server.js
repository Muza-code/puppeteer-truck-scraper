const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const sites = {
  'mobile.de': {
    name: 'mobile.de',
    url: 'https://suchen.mobile.de/lkw/sattelzugmaschine.html?minYear=2021&scopeId=C',
    listSelector: 'article',
    titleSelector: 'h2, .title',
    priceSelector: '.price, [data-testid="offer-price"]',
    linkSelector: 'a'
  },
  'autoscout24.de': {
    name: 'autoscout24.de',
    url: 'https://www.autoscout24.de/lst/lkw?yearfrom=2021&atype=C',
    listSelector: 'article',
    titleSelector: 'h2',
    priceSelector: '.price',
    linkSelector: 'a'
  }
  // truck1.eu и autoline.info пока отключены, чтобы не усложнять
};

async function scrapeSite(siteKey) {
  const config = sites[siteKey];
  if (!config) throw new Error('Неизвестный сайт');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 30000 });

    const listings = await page.evaluate((cfg) => {
      return Array.from(document.querySelectorAll(cfg.listSelector)).slice(0, 10).map(item => ({
        listing_id: Date.now().toString() + Math.random(),
        source: cfg.name,
        title: item.querySelector(cfg.titleSelector)?.innerText.trim() || 'Без названия',
        price: item.querySelector(cfg.priceSelector)?.innerText.trim() || 'Цена не указана',
        url: item.querySelector(cfg.linkSelector)?.href || ''
      }));
    }, config);

    return listings;
  } finally {
    await browser.close();
  }
}

app.post('/scrape', async (req, res) => {
  const { site } = req.body;
  if (!sites[site]) return res.status(400).json({ success: false, error: 'Bad site' });

  try {
    const listings = await scrapeSite(site);
    res.json({ success: true, site, count: listings.length, listings });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));