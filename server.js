const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ==================== НАСТРОЙКИ САЙТОВ ====================
const sites = {
  'mobile.de': {
    name: 'mobile.de',
    url: 'https://suchen.mobile.de/lkw/sattelzugmaschine.html?minYear=2021&scopeId=C&sortOption.sortBy=searchNetGrossPrice&sortOption.sortOrder=ASCENDING',
    listSelector: 'article[data-testid="offer-list-item"]',
    titleSelector: '[data-testid="offer-title"]',
    priceSelector: '[data-testid="offer-price"]',
    linkSelector: 'a[data-testid="offer-link"]'
  },
  'autoscout24.de': {
    name: 'autoscout24.de',
    url: 'https://www.autoscout24.de/lst/lkw?sort=standard&desc=0&ustate=N%2CU&size=20&cy=D&atype=C&body=2&yearfrom=2021',
    listSelector: 'article.c-result-tile',
    titleSelector: 'h2.c-result-tile__title',
    priceSelector: 'span.c-result-tile__price',
    linkSelector: 'a.c-result-tile__link'
  },
  'truck1.eu': {
    name: 'truck1.eu',
    url: 'https://www.truck1.eu/tractor-units?yr-2021',
    listSelector: 'div.offer-item',
    titleSelector: 'h3.offer-title',
    priceSelector: 'div.offer-price',
    linkSelector: 'a.offer-link'
  },
  'autoline.info': {
    name: 'autoline.info',
    url: 'https://autoline.info/-/truck-tractors/2021--c42ym2021',
    listSelector: 'div.listing-item',
    titleSelector: 'h3.listing-title',
    priceSelector: 'div.listing-price',
    linkSelector: 'a.listing-link'
  }
};

async function scrapeSite(siteKey) {
  const config = sites[siteKey];
  if (!config) throw new Error('Неизвестный сайт: ' + siteKey);

  console.log(`[Скрапер] Запуск: ${config.name}`);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium',   // важно для Railway
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    timeout: 30000
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');
    
    console.log(`[Скрапер] Переход на ${config.url}`);
    await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 30000 });

    await page.waitForSelector(config.listSelector, { timeout: 15000 });

    const listings = await page.evaluate((cfg) => {
      const items = Array.from(document.querySelectorAll(cfg.listSelector)).slice(0, 20);
      
      return items.map(item => {
        const title = item.querySelector(cfg.titleSelector)?.innerText.trim() || 'Без названия';
        const price = item.querySelector(cfg.priceSelector)?.innerText.trim() || 'Цена не указана';
        let url = item.querySelector(cfg.linkSelector)?.href || '';

        if (url && !url.startsWith('http')) {
          url = 'https:' + url;
        }

        const listing_id = url.split('/').pop().replace(/[^0-9a-zA-Z]/g, '') || Date.now().toString();

        return {
          listing_id,
          source: cfg.name,
          title,
          price,
          url
        };
      });
    }, config);

    console.log(`[Скрапер] Найдено ${listings.length} объявлений на ${config.name}`);
    return listings;

  } catch (err) {
    console.error(`[Ошибка] ${config.name}:`, err.message);
    throw err;
  } finally {
    await browser.close().catch(() => {});
  }
}

// ====================== API ======================
app.post('/scrape', async (req, res) => {
  const { site } = req.body;

  if (!site || !sites[site]) {
    return res.status(400).json({ 
      success: false, 
      error: 'Укажите site: mobile.de, autoscout24.de, truck1.eu или autoline.info' 
    });
  }

  try {
    const listings = await scrapeSite(site);
    res.json({
      success: true,
      site: site,
      count: listings.length,
      listings: listings
    });
  } catch (error) {
    console.error('Ошибка в /scrape:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      site: site
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    message: 'Puppeteer сервис работает'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Puppeteer сервис запущен на порту ${PORT}`);
  console.log('Доступные сайты:', Object.keys(sites).join(', '));
});