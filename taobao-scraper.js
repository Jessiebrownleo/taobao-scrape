const puppeteer = require('puppeteer');
const fs = require('fs');

// Configuration
const CONFIG = {
    headless: false,
    maxProducts: 10000, // Increased limit for "infinite" scroll
    scrollDelay: 2000,
    outputFile: 'taobao_products.json',
    cookiesFile: 'cookies.json'
};

const stealthConfig = {
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security'
    ],
    ignoreDefaultArgs: ['--enable-automation'],
};

async function saveCookies(page) {
    const cookies = await page.cookies();
    fs.writeFileSync(CONFIG.cookiesFile, JSON.stringify(cookies, null, 2));
    console.log('🍪 Cookies saved to ' + CONFIG.cookiesFile);
}

async function loadCookies(page) {
    if (fs.existsSync(CONFIG.cookiesFile)) {
        const cookiesString = fs.readFileSync(CONFIG.cookiesFile);
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        console.log(`🍪 Loaded ${cookies.length} cookies from ${CONFIG.cookiesFile}`);
        return true;
    }
    return false;
}

async function setupPage(page) {
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'] });
    });

    await page.setExtraHTTPHeaders({
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
}


async function navigateToHomepage(page) {
    console.log(`📍 Navigating to Taobao Homepage...`);

    try {
        await page.goto('https://www.taobao.com/', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });

        console.log('✅ Loaded Homepage');
        console.log(`📍 Current URL: ${page.url()}`);

        // Wait for initial load
        await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
        console.error('❌ Error loading homepage:', error.message);
        throw error;
    }
}

async function scrollAndLoadMore(page) {
    console.log('📜 Scrolling infinitely until end of feed...');

    let previousHeight = 0;
    let noChangeCount = 0;
    let scrollCount = 0;

    while (true) {
        scrollCount++;

        // Scroll to bottom
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });

        // Wait for new content to load
        const waitTime = 1500 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // specific workaround for Taobao lazy loading triggers
        if (scrollCount % 3 === 0) {
            await page.evaluate(() => window.scrollBy(0, -300)); // Scroll up slightly to trigger observers
            await new Promise(resolve => setTimeout(resolve, 500));
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        }

        const newHeight = await page.evaluate(() => document.body.scrollHeight);

        // Check actual item count to give user feedback
        const itemCount = await page.evaluate(() => {
            return document.querySelectorAll('a[href*="item.taobao"], a[href*="detail.tmall"]').length;
        });

        console.log(`   Scroll ${scrollCount}: Height ${newHeight}px | Items visible: ~${itemCount}`);

        if (newHeight === previousHeight) {
            noChangeCount++;
            console.log(`   ⚠️ Height did not change (${noChangeCount}/5)`);

            // Give it 5 tries before giving up (network lag etc)
            if (noChangeCount >= 5) {
                console.log('   ✅ Reached end of page (or maximum feed depth). Stopping scroll.');
                break;
            }
        } else {
            noChangeCount = 0;
            previousHeight = newHeight;
        }

        // Safety break for testing (optional, can be removed for true infinite)
        if (scrollCount >= 500) {
            console.log('   🛑 Safety limit reached (500 scrolls). Stopping.');
            break;
        }
    }
}

async function extractProducts(page, maxProducts) {
    console.log('📦 Extracting product data from homepage feed...');

    const products = await page.evaluate((max) => {
        const results = [];

        // Homepage feed usually uses these structures or generic links to items
        // Strategy: Find all links that look like product details
        const allLinks = Array.from(document.querySelectorAll('a'));

        const productLinks = allLinks.filter(a => {
            const href = a.href || '';
            const isProduct = href.includes('item.taobao.com') || href.includes('detail.tmall.com');
            const hasImage = a.querySelector('img') !== null;
            // Ensure acceptable size to avoid tiny tracking pixels/links
            const rect = a.getBoundingClientRect();
            const isVisible = rect.width > 50 && rect.height > 50;
            return isProduct && hasImage && isVisible;
        });

        console.log(`Found ${productLinks.length} potential product cards`);

        for (const item of productLinks) {
            if (results.length >= max) break;

            try {
                // The 'item' here is the <a> tag itself in many feed layouts
                // Or a specific container. Let's assume the <a> is the wrapper or close to it.

                // DATA EXTRACTION HEURISTICS
                const allText = item.innerText || '';

                // Helper to find text safely within the card
                const findText = (regex) => {
                    const match = allText.match(regex);
                    return match ? match[0] : null;
                };

                // 1. Price (Crucial)
                let price = findText(/[¥￥]\s*[\d,]+(\.\d+)?/);
                if (!price) {
                    // Look in siblings if the <a> wraps only image or title
                    const parent = item.parentElement;
                    if (parent) {
                        const parentText = parent.innerText;
                        const parentPrice = parentText.match(/[¥￥]\s*[\d,]+(\.\d+)?/);
                        if (parentPrice) price = parentPrice[0];
                    }
                }
                if (!price) continue; // Skip if no price found (likely not a product card)

                // 2. Title
                let title = '';
                const titleNode = item.querySelector('h3, h4, span[class*="title"], div[class*="title"]');
                if (titleNode) title = titleNode.innerText.trim();
                if (!title) {
                    // Filter out price from all text to get potential title
                    const textParts = allText.split('\n').map(t => t.trim()).filter(t => t.length > 5 && !t.includes('¥'));
                    if (textParts.length > 0) title = textParts[0];
                }
                if (!title && item.title) title = item.title;

                // 3. Image
                const imgEl = item.querySelector('img');
                let image = 'N/A';
                if (imgEl) {
                    image = imgEl.src || imgEl.dataset.src || imgEl.getAttribute('data-lazy-src') || 'N/A';
                    if (image.startsWith('//')) image = 'https:' + image;
                }

                // 4. Link
                let link = item.href;
                if (link.startsWith('//')) link = 'https:' + link;

                results.push({
                    title: title || 'N/A',
                    price: price.replace(/[^\d.,]/g, ''),
                    image,
                    link,
                    extractedAt: new Date().toISOString()
                });

            } catch (e) {
                console.error('Error parsing item', e);
            }
        }

        return results;
    }, maxProducts);

    console.log(`✅ Extracted ${products.length} products`);
    return products;
}

async function saveResults(products, filename) {
    const data = {
        totalProducts: products.length,
        scrapedAt: new Date().toISOString(),
        products: products
    };

    fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`💾 Results saved to ${filename}`);
}

async function main() {
    console.log('🚀 Starting Taobao Homepage Scraper...\n');

    let browser;

    try {
        browser = await puppeteer.launch({
            headless: CONFIG.headless,
            ...stealthConfig
        });

        const page = await browser.newPage();
        await setupPage(page);

        // Load cookies if they exist (helps with "guess you like" personalization)
        await loadCookies(page);

        // Navigate to Homepage
        await navigateToHomepage(page);

        // Scroll aggressively to load feed
        await scrollAndLoadMore(page);

        const products = await extractProducts(page, CONFIG.maxProducts);

        await saveResults(products, CONFIG.outputFile);

        console.log('\n✨ Scraping completed!');
        console.log(`📊 Total products scraped: ${products.length}`);

        if (products.length > 0) {
            console.log('\n📋 Sample products:');
            products.slice(0, 3).forEach((p, idx) => {
                console.log(`\n${idx + 1}. ${p.title.substring(0, 50)}...`);
                console.log(`   Price: ${p.price}`);
                console.log(`   Link: ${p.link.substring(0, 60)}...`);
            });
        }

    } catch (error) {
        console.error('\n❌ Scraping failed:', error.message);
        console.error(error.stack);
    } finally {
        if (browser) {
            console.log('\n⏸️  Browser will close in 5 seconds...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            await browser.close();
            console.log('🔒 Browser closed');
        }
    }
}

main();
