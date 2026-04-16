const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const sites = {
  'mobile.de': {
    name: 'mobile.de',
    url: 'https://suchen.mobile.de/lkw/sattelzugmaschine.html?minYear=2021&scopeId=C',
    waitSelector: 'article, .offer-list-item, [data-testid="offer-list-item"]',
    listingSelector: 'article'
  },
  'autoscout24.de': {
    name: 'autoscout24.de',
    url: 'https://www.autoscout24.de/lst/lkw?yearfrom=2021&atype=C&sort=standard',
    waitSelector: 'article, .c-result-tile',
    listingSelector: 'article'
  }
};

async function scrapeSite(siteKey) {
  const config = sites[siteKey];
  if (!config) throw new Error('Неизвестный сайт: ' + siteKey);

  console.log(`[Скрапер] Запуск ${config.name}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');

    await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 40000 });

    // Ждём любые объявления
    await page.waitForSelector(config.waitSelector, { timeout: 20000 }).catch(() => {
      console.log('Селектор не найден, продолжаем...');
    });

    const listings = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('article, div[class*="offer"], div[class*="result"], div[class*="listing"]')).slice(0, 15);

      return items.map(item => {
        const title = item.innerText.split('\n')[0] || 'Без названия';
        const priceMatch = item.innerText.match(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*€?/);
        const price = priceMatch ? priceMatch[0] + ' €' : 'Цена не указана';

        let url = '';
        const link = item.querySelector('a');
        if (link) url = link.href;

        const listing_id = url ? url.split('/').pop().replace(/\D/g, '') : Date.now().toString();

        return {
          listing_id: listing_id || Date.now().toString(),
          source: 'mobile.de',
          title: title.trim().substring(0, 150),
          price: price,
          url: url || ''
        };
      }).filter(item => item.url);
    });

    console.log(`Найдено ${listings.length} объявлений`);
    return listings;

  } catch (err) {
    console.error('Ошибка:', err.message);
    throw err;
  } finally {
    await browser.close();
  }
}

// API
app.post('/scrape', async (req, res) => {
  const { site } = req.body;
  if (!site) return res.status(400).json({ success: false, error: 'Укажите site' });

  try {
    const listings = await scrapeSite(site);
    res.json({
      success: true,
      site,
      count: listings.length,
      listings
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`🚀 Сервис запущен на порту ${PORT}`);
});