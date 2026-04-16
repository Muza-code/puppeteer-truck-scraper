const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/scrape', async (req, res) => {
  const { site } = req.body;
  if (site !== 'mobile.de') {
    return res.status(400).json({ success: false, error: 'Пока только mobile.de' });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');

    const url = 'https://suchen.mobile.de/lkw/sattelzugmaschine.html?minYear=2021&scopeId=C&sortOption.sortBy=searchNetGrossPrice&sortOption.sortOrder=ASCENDING';
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // Очень агрессивный парсинг — берём всё, что выглядит как объявление
    const listings = await page.evaluate(() => {
      const results = [];

      // Ищем все возможные карточки объявлений
      const candidates = document.querySelectorAll('article, div[class*="offer"], div[class*="result"], div[class*="listing"], div[data-testid], section');

      candidates.forEach((el, index) => {
        const text = el.innerText || '';
        if (text.length < 30) return; // слишком короткий блок

        // Ищем цену
        const priceMatch = text.match(/(\d{1,3}(?:\s?\d{3})*(?:,\d+)?)\s*€/);
        const price = priceMatch ? priceMatch[0] + ' €' : 'Цена не указана';

        // Ищем ссылку
        let url = '';
        const link = el.querySelector('a[href*="/details/"], a[href*="/lk w/"]');
        if (link) url = link.href;

        if (!url) {
          const anyLink = el.querySelector('a');
          if (anyLink && anyLink.href.includes('mobile.de')) url = anyLink.href;
        }

        if (url) {
          const title = text.split('\n')[0].trim().substring(0, 150) || 'Грузовик ' + (index + 1);

          results.push({
            listing_id: url.split('/').pop().replace(/\D/g, '') || 'id' + Date.now() + index,
            source: 'mobile.de',
            title: title,
            price: price,
            url: url
          });
        }
      });

      return results.slice(0, 20);
    });

    // Делаем скриншот для отладки
    const screenshot = await page.screenshot({ encoding: 'base64' });

    res.json({
      success: true,
      site: 'mobile.de',
      count: listings.length,
      listings: listings,
      debug: {
        screenshot_length: screenshot.length,
        message: listings.length > 0 ? "Объявления найдены!" : "Объявления не найдены. Скриншот сделан."
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    await browser.close();
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`🚀 Сервис на порту ${PORT}`));