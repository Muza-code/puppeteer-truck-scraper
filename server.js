const express = require('express');
const { chromium } = require('playwright');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const sites = {
  'truck1.eu': {
    name: 'truck1.eu',
    url: 'https://www.truck1.eu/tractor-units?yr-2021',
    selector: 'div.offer-item, article, .offer'
  },
  'autoline.info': {
    name: 'autoline.info',
    url: 'https://autoline.info/-/truck-tractors/2021--c42ym2021',
    selector: 'div.listing-item, article, .offer-card'
  }
};

app.post('/scrape', async (req, res) => {
  const { site } = req.body;

  if (!sites[site]) {
    return res.status(400).json({ 
      success: false, 
      error: 'Поддерживаются только truck1.eu и autoline.info' 
    });
  }

  const config = sites[site];
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto(config.url, { waitUntil: 'networkidle', timeout: 45000 });

    // Ждём загрузки объявлений
    await page.waitForTimeout(6000);

    const listings = await page.evaluate((cfg) => {
      const results = [];
      const cards = document.querySelectorAll(cfg.selector);

      cards.forEach((card, i) => {
        const text = card.innerText || '';
        if (text.length < 40) return;

        // Цена
        const priceMatch = text.match(/(\d{1,3}(?:\s?\d{3})*(?:,\d+)?)\s*€?/i);
        const price = priceMatch ? priceMatch[0] + ' €' : 'Цена не указана';

        // Ссылка
        let url = '';
        const link = card.querySelector('a');
        if (link) url = link.href.startsWith('http') ? link.href : 'https://www.truck1.eu' + link.href;

        if (url) {
          results.push({
            listing_id: url.split('/').pop().replace(/\D/g, '') || String(Date.now() + i),
            source: cfg.name,
            title: text.split('\n')[0].trim().substring(0, 140),
            price: price,
            url: url
          });
        }
      });
      return results.slice(0, 20);
    }, config);

    res.json({
      success: true,
      site: config.name,
      count: listings.length,
      listings: listings
    });

  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`🚀 Сервис запущен на порту ${PORT}`);
  console.log('Доступные сайты: truck1.eu, autoline.info');
});