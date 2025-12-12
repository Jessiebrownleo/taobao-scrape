const puppeteer = require('puppeteer');
const fs = require('fs');

// Enhanced Configuration
const CONFIG = {
    headless: false,
    maxProductsTotal: 10000,
    maxProductsPerSearch: 500,
    maxPagesPerSearch: 10,
    scrollDelay: 1500,
    outputFile: 'taobao_products_detailed.json',
    debugLogFile: 'taobao_scraping_debug.json',
    cookiesFile: 'cookies.json',
    maxScrollAttempts: 30,
    enableDebugLogging: true,
    maxDebugItems: 20,
    searchDelay: 3000,
    pageLoadDelay: 5000,
    paginationDelay: 4000,
    detailPageDelay: 3000, // NEW: Delay for detail pages
    screenshotOnError: true,
    scrapeDetailPages: true, // NEW: Enable/disable detail scraping
    maxDetailPageRetries: 2, // NEW: Retries for failed detail pages
    detailPageTimeout: 20000, // NEW: Timeout for detail pages
    batchDetailScraping: true, // NEW: Scrape details in batches
    detailBatchSize: 10, // NEW: How many details to scrape before saving progress
    loginCredentials: {
        username: 'kaizenguru',
        password: 'Qwerty@2001'
    },
    loginTimeout: 60000,
    maxLoginAttempts: 3,
    retryAttempts: 3,
    retryDelay: 2000
};

// Search keywords
const SEARCH_KEYWORDS = [
    { name: 'Women\'s Clothing', keyword: 'women clothing', category: 'womens-fashion' },
    { name: 'Dresses', keyword: 'dresses', category: 'womens-fashion' },
    { name: 'Men\'s Clothing', keyword: 'men clothing', category: 'mens-fashion' },
    { name: 'T-Shirts', keyword: 't-shirts', category: 'mens-fashion' },
    { name: 'Mother & Baby Products', keyword: 'baby products', category: 'mother-baby' },
    { name: 'Baby Formula', keyword: 'baby formula', category: 'mother-baby' },
    { name: 'Beauty & Skincare', keyword: 'beauty skincare', category: 'beauty-cosmetics' },
    { name: 'Lipstick', keyword: 'lipstick', category: 'beauty-cosmetics' },
    { name: 'Home & Living', keyword: 'home decor', category: 'home-living' },
    { name: 'Bedding', keyword: 'bedding', category: 'home-living' },
    { name: 'Shoes & Bags', keyword: 'shoes bags', category: 'shoes-bags' },
    { name: 'Sneakers', keyword: 'sneakers', category: 'shoes-bags' },
    { name: 'Electronics', keyword: 'electronics', category: 'electronics' },
    { name: 'Mobile Phones', keyword: 'mobile phones', category: 'electronics' },
    { name: 'Sports & Outdoor', keyword: 'sports outdoor', category: 'sports-outdoor' },
    { name: 'Treadmill', keyword: 'treadmill', category: 'sports-outdoor' }
];

const stealthConfig = {
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--window-size=1920,1080',
        '--disable-infobars',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ],
    ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=AutomationControlled'],
    ignoreHTTPSErrors: true,
};

// Helper function to check if URL is a valid product link
function isValidProductLink(url) {
    if (!url) return false;
    const hasValidDomain = url.includes('item.taobao.com') || url.includes('detail.tmall.com');
    const hasItemId = /[?&]id=\d+/.test(url);
    const excludePatterns = [
        'shop/view_shop.htm', 'store.taobao.com', 'my_itaobao', 'cart.taobao.com',
        'login.taobao.com', 'pc.taobao.com', 'pages.tmall.com', 'click.simba.taobao.com'
    ];
    const isExcluded = excludePatterns.some(pattern => url.includes(pattern));
    return hasValidDomain && hasItemId && !isExcluded;
}

// Load cookies
async function loadCookies(page) {
    if (fs.existsSync(CONFIG.cookiesFile)) {
        const cookiesString = fs.readFileSync(CONFIG.cookiesFile);
        const cookies = JSON.parse(cookiesString);
        await page.setCookie(...cookies);
        console.log(`🍪 Loaded ${cookies.length} cookies`);
        return true;
    }
    return false;
}

// Save cookies
async function saveCookies(page) {
    const cookies = await page.cookies();
    fs.writeFileSync(CONFIG.cookiesFile, JSON.stringify(cookies, null, 2));
    console.log(`💾 Saved ${cookies.length} cookies`);
}

// Login function
async function performLogin(page) {
    console.log('\n🔐 PERFORMING LOGIN');
    console.log('='.repeat(60));

    try {
        console.log('📍 Navigating to Taobao login page...');
        await page.goto('https://login.taobao.com/member/login.jhtml', {
            waitUntil: 'networkidle2',
            timeout: CONFIG.loginTimeout
        });

        await new Promise(resolve => setTimeout(resolve, 3000));

        const currentUrl = page.url();
        if (!currentUrl.includes('login')) {
            console.log('✅ Already logged in!');
            await saveCookies(page);
            return true;
        }

        console.log('📝 Manual login required - please complete in browser');
        console.log('⏳ Waiting up to 60 seconds for manual login...\n');

        const waitStart = Date.now();
        while (Date.now() - waitStart < 60000) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const url = page.url();
            if (!url.includes('login') && !url.includes('verify') && !url.includes('sec.taobao.com')) {
                console.log('✅ Login completed!');
                await saveCookies(page);
                return true;
            }
        }

        console.log('❌ Login timeout');
        return false;

    } catch (error) {
        console.error('❌ Login error:', error.message);
        return false;
    }
}

// Setup page
async function setupPage(page) {
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'] });
        window.chrome = { runtime: {} };
    });

    await page.setExtraHTTPHeaders({
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
}

// Wait for products
async function waitForProducts(page, timeout = 10000) {
    console.log('   ⏳ Waiting for products to load...');
    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < timeout) {
        attempts++;
        const productCount = await page.evaluate(() => {
            const selectors = [
                'a[href*="item.taobao.com"][href*="id="]',
                'a[href*="detail.tmall.com"][href*="id="]'
            ];
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) return elements.length;
            }
            return 0;
        });

        if (productCount > 0) {
            console.log(`   ✅ Found ${productCount} products`);
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('   ⚠️  Timeout waiting for products');
    return false;
}

// Optimized scroll function
async function smartScroll(page, maxScrolls = 20) {
    let previousCount = 0;
    let noChangeCount = 0;
    let scrollCount = 0;

    while (scrollCount < maxScrolls) {
        scrollCount++;
        try {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(resolve => setTimeout(resolve, 800));

            const itemCount = await page.evaluate(() => {
                const links = document.querySelectorAll('a[href*="item.taobao.com"][href*="id="], a[href*="detail.tmall.com"][href*="id="]');
                return links.length;
            });

            if (itemCount === previousCount) {
                noChangeCount++;
                if (noChangeCount >= 3) break;
            } else {
                noChangeCount = 0;
                previousCount = itemCount;
            }
        } catch (error) {
            break;
        }
    }
}

// Extract products from current page
async function extractProducts(page, searchInfo = {}, pageNum = 1) {
    const searchName = searchInfo.name || 'unknown';
    const categoryId = searchInfo.category || 'unknown';

    const products = await page.evaluate((searchNameParam, catId, pageNumber) => {
        const results = [];
        const seen = new Set();

        function getItemId(url) {
            const match = url.match(/[?&]id=(\d+)/);
            return match ? match[1] : null;
        }

        function isValidProduct(url) {
            if (!url) return false;
            const hasValidDomain = url.includes('item.taobao.com') || url.includes('detail.tmall.com');
            const hasItemId = /[?&]id=\d+/.test(url);
            const excludePatterns = ['shop/view_shop', 'store.taobao', 'my_itaobao', 'cart.taobao', 
                                     'login.taobao', 'pc.taobao', 'pages.tmall', 'click.simba'];
            const isExcluded = excludePatterns.some(p => url.includes(p));
            return hasValidDomain && hasItemId && !isExcluded;
        }

        const allLinks = Array.from(document.querySelectorAll('a[href]'));
        const productLinks = allLinks.filter(link => isValidProduct(link.href));

        for (const item of productLinks) {
            try {
                const link = item.href;
                const itemId = getItemId(link);
                if (!itemId || seen.has(itemId)) continue;
                seen.add(itemId);

                const container = item.closest('[class*="item"]') || item.closest('[class*="Item"]') ||
                                item.closest('[class*="card"]') || item.closest('[class*="Card"]') ||
                                item.closest('div[data-itemid]') || item.parentElement;

                const allText = (item.textContent || '') + ' ' + (container?.textContent || '');

                // Extract price
                let price = null;
                if (container) {
                    const priceElement = container.querySelector('[class*="price"]') ||
                                       container.querySelector('[class*="Price"]') ||
                                       container.querySelector('strong');
                    if (priceElement) {
                        const priceMatch = priceElement.textContent.match(/[\d,]+(\.\d+)?/);
                        if (priceMatch) price = priceMatch[0].replace(/,/g, '');
                    }
                }
                if (!price) {
                    const priceMatch = allText.match(/[¥￥]\s*([\d,]+(?:\.\d+)?)/);
                    if (priceMatch) price = priceMatch[1].replace(/,/g, '');
                }
                if (!price) continue;

                // Extract title
                let title = '';
                const titleElement = item.querySelector('[class*="title"]') ||
                                   item.querySelector('[class*="Title"]') ||
                                   container?.querySelector('[class*="title"]') ||
                                   item.querySelector('h3') || item.querySelector('h4');

                if (titleElement) {
                    title = titleElement.textContent?.trim();
                } else {
                    title = item.getAttribute('title') || item.title || '';
                }

                const img = item.querySelector('img') || container?.querySelector('img');
                if (!title && img) {
                    title = img.alt || img.title || '';
                }
                if (!title || title.length < 3) continue;

                // Extract image
                let image = 'N/A';
                if (img) {
                    image = img.src || img.dataset.src || img.getAttribute('data-lazy-src') || 'N/A';
                    if (image.startsWith('//')) image = 'https:' + image;
                }

                const additionalData = {};

                const salesMatch = allText.match(/(\d+[\d,]*)\s*人付款|已售\s*(\d+[\d,]*)|月销\s*(\d+[\d,]*)/);
                if (salesMatch) {
                    additionalData.sales = (salesMatch[1] || salesMatch[2] || salesMatch[3]).replace(/,/g, '');
                }

                const shopEl = container?.querySelector('[class*="shop"]') || container?.querySelector('[class*="Shop"]');
                if (shopEl && shopEl.textContent.trim().length > 2) {
                    additionalData.shopName = shopEl.textContent.trim().substring(0, 100);
                }

                const locationEl = container?.querySelector('[class*="location"]');
                if (locationEl) {
                    const locText = locationEl.textContent.trim();
                    if (locText.length >= 2 && locText.length <= 10) {
                        additionalData.location = locText;
                    }
                }

                additionalData.itemId = itemId;
                additionalData.pageNumber = pageNumber;

                results.push({
                    title: title.substring(0, 200).trim(),
                    price: price,
                    image,
                    link,
                    searchKeyword: searchNameParam,
                    categoryId: catId,
                    extractedAt: new Date().toISOString(),
                    detailsScraped: false, // NEW: Track if details were scraped
                    ...additionalData
                });

            } catch (e) {
                console.log('Error extracting product:', e.message);
            }
        }

        return results;
    }, searchName, categoryId, pageNum);

    return products;
}

// NEW: Scrape product detail page
async function scrapeProductDetail(page, product, retryCount = 0) {
    const productUrl = product.link;
    const itemId = product.itemId;
    
    try {
        console.log(`      🔍 Scraping details for item ${itemId}...`);
        
        // Navigate to product page
        await page.goto(productUrl, {
            waitUntil: 'domcontentloaded',
            timeout: CONFIG.detailPageTimeout
        });
        
        await new Promise(resolve => setTimeout(resolve, CONFIG.detailPageDelay));
        
        // Check if redirected to login
        const currentUrl = page.url();
        if (currentUrl.includes('login') || currentUrl.includes('verify')) {
            console.log(`      ⚠️  Login required for item ${itemId}, skipping...`);
            return null;
        }
        
        // Extract detailed information
        const details = await page.evaluate(() => {
            const result = {};
            
            // Full Description
            const descSelectors = [
                '.tb-detail-hd',
                '.item-desc',
                '[class*="description"]',
                '[class*="Description"]',
                '.detail-content',
                '#description',
                '.attributes-list'
            ];
            
            for (const selector of descSelectors) {
                const elem = document.querySelector(selector);
                if (elem && elem.textContent.trim().length > 10) {
                    result.fullDescription = elem.textContent.trim().substring(0, 1000);
                    break;
                }
            }
            
            // Specifications / Attributes
            const specs = {};
            const specContainers = document.querySelectorAll('.attributes-list li, .tb-property-type, [class*="property"], [class*="spec"]');
            
            specContainers.forEach(item => {
                const text = item.textContent.trim();
                const parts = text.split(/[:：]/);
                if (parts.length === 2) {
                    const key = parts[0].trim();
                    const value = parts[1].trim();
                    if (key.length > 0 && key.length < 50 && value.length > 0) {
                        specs[key] = value.substring(0, 200);
                    }
                }
            });
            
            if (Object.keys(specs).length > 0) {
                result.specifications = specs;
            }
            
            // Brand
            const brandSelectors = ['.tb-brand', '[class*="brand"]', '[data-spm*="brand"]'];
            for (const selector of brandSelectors) {
                const elem = document.querySelector(selector);
                if (elem) {
                    const brandText = elem.textContent.trim();
                    if (brandText.length > 1 && brandText.length < 50) {
                        result.brand = brandText;
                        break;
                    }
                }
            }
            
            // Additional Images
            const images = [];
            const imgSelectors = document.querySelectorAll('#J_UlThumb img, .tb-thumb img, [class*="thumb"] img');
            imgSelectors.forEach(img => {
                let src = img.src || img.dataset.src || img.getAttribute('data-lazy-src');
                if (src && !images.includes(src)) {
                    if (src.startsWith('//')) src = 'https:' + src;
                    images.push(src);
                }
            });
            
            if (images.length > 0) {
                result.additionalImages = images.slice(0, 10); // Limit to 10 images
            }
            
            // Reviews Count
            const reviewsSelectors = [
                '[class*="rate-count"]',
                '[class*="reviewCount"]',
                '.tb-rate-counter',
                '[data-spm*="reviews"]'
            ];
            
            for (const selector of reviewsSelectors) {
                const elem = document.querySelector(selector);
                if (elem) {
                    const reviewText = elem.textContent.trim();
                    const reviewMatch = reviewText.match(/(\d+)/);
                    if (reviewMatch) {
                        result.reviewsCount = reviewMatch[1];
                        break;
                    }
                }
            }
            
            // Rating
            const ratingSelectors = [
                '.tb-rate-star',
                '[class*="rating"]',
                '[class*="score"]'
            ];
            
            for (const selector of ratingSelectors) {
                const elem = document.querySelector(selector);
                if (elem) {
                    const ratingText = elem.textContent.trim();
                    const ratingMatch = ratingText.match(/([\d.]+)/);
                    if (ratingMatch) {
                        result.rating = ratingMatch[1];
                        break;
                    }
                }
            }
            
            // Stock Status
            const stockSelectors = [
                '.tb-amount',
                '[class*="stock"]',
                '[class*="quantity"]'
            ];
            
            for (const selector of stockSelectors) {
                const elem = document.querySelector(selector);
                if (elem) {
                    const stockText = elem.textContent.trim();
                    if (stockText.includes('有货') || stockText.includes('现货')) {
                        result.inStock = true;
                    } else if (stockText.includes('无货') || stockText.includes('缺货')) {
                        result.inStock = false;
                    }
                    break;
                }
            }
            
            // Shipping Info
            const shippingSelectors = [
                '.tb-shipping',
                '[class*="delivery"]',
                '[class*="shipping"]'
            ];
            
            for (const selector of shippingSelectors) {
                const elem = document.querySelector(selector);
                if (elem) {
                    const shippingText = elem.textContent.trim();
                    if (shippingText.length > 2 && shippingText.length < 200) {
                        result.shippingInfo = shippingText;
                        break;
                    }
                }
            }
            
            // SKU Options (sizes, colors, etc.)
            const skuOptions = {};
            const skuContainers = document.querySelectorAll('.tb-sku, [class*="sku-item"], [class*="property-item"]');
            
            skuContainers.forEach(container => {
                const labelElem = container.querySelector('[class*="label"], dt, .tb-property-type');
                const valuesElems = container.querySelectorAll('[class*="value"], dd, li');
                
                if (labelElem && valuesElems.length > 0) {
                    const label = labelElem.textContent.trim();
                    const values = Array.from(valuesElems)
                        .map(v => v.textContent.trim())
                        .filter(v => v.length > 0 && v.length < 100);
                    
                    if (label.length > 0 && values.length > 0) {
                        skuOptions[label] = values.slice(0, 20); // Limit to 20 options
                    }
                }
            });
            
            if (Object.keys(skuOptions).length > 0) {
                result.skuOptions = skuOptions;
            }
            
            return result;
        });
        
        if (Object.keys(details).length > 0) {
            console.log(`      ✅ Successfully scraped details for item ${itemId}`);
            return details;
        } else {
            console.log(`      ⚠️  No details found for item ${itemId}`);
            return null;
        }
        
    } catch (error) {
        console.log(`      ❌ Error scraping details for item ${itemId}: ${error.message}`);
        
        // Retry logic
        if (retryCount < CONFIG.maxDetailPageRetries) {
            console.log(`      🔄 Retrying (${retryCount + 1}/${CONFIG.maxDetailPageRetries})...`);
            await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
            return await scrapeProductDetail(page, product, retryCount + 1);
        }
        
        return null;
    }
}

// NEW: Scrape details for multiple products
async function scrapeProductDetails(page, products) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📝 SCRAPING PRODUCT DETAILS`);
    console.log(`${'='.repeat(60)}\n`);
    console.log(`📊 Total products to scrape: ${products.length}`);
    console.log(`⚙️  Batch size: ${CONFIG.detailBatchSize}\n`);
    
    const detailedProducts = [];
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < products.length; i++) {
        const product = products[i];
        const progress = `[${i + 1}/${products.length}]`;
        
        console.log(`\n   ${progress} Processing: ${product.title.substring(0, 50)}...`);
        
        const details = await scrapeProductDetail(page, product);
        
        if (details) {
            detailedProducts.push({
                ...product,
                ...details,
                detailsScraped: true,
                detailScrapedAt: new Date().toISOString()
            });
            successCount++;
        } else {
            detailedProducts.push({
                ...product,
                detailsScraped: false
            });
            failCount++;
        }
        
        // Save progress every batch
        if (CONFIG.batchDetailScraping && (i + 1) % CONFIG.detailBatchSize === 0) {
            console.log(`\n   💾 Saving progress checkpoint... (${i + 1}/${products.length})`);
            const checkpoint = {
                totalProducts: detailedProducts.length,
                successCount,
                failCount,
                lastUpdated: new Date().toISOString(),
                products: detailedProducts
            };
            fs.writeFileSync('checkpoint_' + CONFIG.outputFile, JSON.stringify(checkpoint, null, 2));
        }
        
        // Random delay between requests
        if (i < products.length - 1) {
            const delay = 2000 + Math.random() * 2000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Detail scraping complete!`);
    console.log(`   Success: ${successCount}/${products.length} (${((successCount/products.length)*100).toFixed(1)}%)`);
    console.log(`   Failed: ${failCount}/${products.length}`);
    console.log(`${'='.repeat(60)}\n`);
    
    return detailedProducts;
}

// Check if next page exists
async function hasNextPage(page) {
    return await page.evaluate(() => {
        const nextButton = document.querySelector('.next') ||
                          document.querySelector('.next-next') ||
                          document.querySelector('button.next-next') ||
                          document.querySelector('a[href*="s=44"]') ||
                          document.querySelector('a[href*="s=88"]') ||
                          document.querySelector('.icon-btn-next') ||
                          document.querySelector('[class*="next"]:not([class*="disabled"])');
        
        if (!nextButton) return null;
        
        const isDisabled = nextButton.classList.contains('disabled') ||
                          nextButton.classList.contains('next-disabled') ||
                          nextButton.hasAttribute('disabled') ||
                          nextButton.classList.contains('next-pagination-disabled');
        
        if (isDisabled) return null;
        
        return nextButton.href || true;
    });
}

// Navigate to next page
async function goToNextPage(page, currentPage) {
    try {
        console.log(`   📄 Navigating to page ${currentPage + 1}...`);
        
        const nextPageInfo = await page.evaluate(() => {
            const nextButton = document.querySelector('.next') ||
                              document.querySelector('.next-next') ||
                              document.querySelector('button.next-next') ||
                              document.querySelector('.icon-btn-next') ||
                              document.querySelector('[class*="next"]:not([class*="disabled"])');
            
            if (!nextButton) return null;
            
            const isDisabled = nextButton.classList.contains('disabled') ||
                              nextButton.classList.contains('next-disabled') ||
                              nextButton.hasAttribute('disabled');
            
            if (isDisabled) return null;
            
            if (nextButton.tagName === 'A' && nextButton.href) {
                return { type: 'link', url: nextButton.href };
            }
            
            return { type: 'button' };
        });
        
        if (!nextPageInfo) {
            console.log('   ⚠️  No next page available');
            return false;
        }
        
        if (nextPageInfo.type === 'link') {
            await page.goto(nextPageInfo.url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
        } else {
            await page.evaluate(() => {
                const nextButton = document.querySelector('.next') ||
                                  document.querySelector('.next-next') ||
                                  document.querySelector('button.next-next') ||
                                  document.querySelector('.icon-btn-next') ||
                                  document.querySelector('[class*="next"]:not([class*="disabled"])');
                if (nextButton) nextButton.click();
            });
            
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        }
        
        await new Promise(resolve => setTimeout(resolve, CONFIG.paginationDelay));
        console.log(`   ✅ Loaded page ${currentPage + 1}`);
        return true;
        
    } catch (error) {
        console.log(`   ⚠️  Error navigating to next page: ${error.message}`);
        return false;
    }
}

// Check if login required
async function checkLoginRequired(page) {
    const url = page.url();
    return url.includes('login') || url.includes('verify') || 
           url.includes('sec.taobao.com') || url.includes('verification');
}

// Perform search with pagination
async function performSearchWithPagination(page, searchInfo) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 SEARCHING: ${searchInfo.name} (${searchInfo.keyword})`);
    console.log(`${'='.repeat(60)}\n`);

    const searchUrl = `https://s.taobao.com/search?q=${encodeURIComponent(searchInfo.keyword)}`;
    let allProducts = [];
    let currentPage = 1;

    try {
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(resolve => setTimeout(resolve, CONFIG.pageLoadDelay));

        if (await checkLoginRequired(page)) {
            console.log(`⚠️  Redirected to login/verification page`);
            const loginSuccess = await performLogin(page);
            if (!loginSuccess) {
                console.log(`❌ Login failed, skipping this search`);
                return [];
            }
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            await new Promise(resolve => setTimeout(resolve, CONFIG.pageLoadDelay));
        }

        while (currentPage <= CONFIG.maxPagesPerSearch && allProducts.length < CONFIG.maxProductsPerSearch) {
            console.log(`\n   📄 Processing page ${currentPage}/${CONFIG.maxPagesPerSearch}`);
            
            const hasProducts = await waitForProducts(page);
            if (!hasProducts) {
                console.log(`   ⚠️  No products found on page ${currentPage}`);
                break;
            }

            await smartScroll(page, CONFIG.maxScrollAttempts);
            const products = await extractProducts(page, searchInfo, currentPage);
            
            console.log(`   ✅ Extracted ${products.length} products from page ${currentPage}`);
            allProducts = allProducts.concat(products);
            console.log(`   📊 Total collected: ${allProducts.length}/${CONFIG.maxProductsPerSearch}`);

            if (allProducts.length >= CONFIG.maxProductsPerSearch) {
                console.log(`   🎯 Reached target products for this search`);
                break;
            }

            const hasNext = await hasNextPage(page);
            if (!hasNext) {
                console.log(`   📄 No more pages available`);
                break;
            }

            const navigated = await goToNextPage(page, currentPage);
            if (!navigated) {
                console.log(`   ⚠️  Could not navigate to next page`);
                break;
            }

            currentPage++;
        }

        console.log(`\n📊 Search complete: ${allProducts.length} products from ${currentPage} pages`);
        return allProducts.slice(0, CONFIG.maxProductsPerSearch);

    } catch (error) {
        console.error(`❌ Error during search "${searchInfo.name}":`, error.message);
        if (CONFIG.screenshotOnError) {
            try {
                await page.screenshot({ path: `error_${searchInfo.keyword}_${Date.now()}.png` });
            } catch (e) {}
        }
        return allProducts;
    }
}

// MAIN FUNCTION
async function main() {
    console.log('🚀 Starting Taobao Scraper with PAGINATION + DETAIL SCRAPING v4');
    console.log(`📋 Strategy: Search using ${SEARCH_KEYWORDS.length} keywords with pagination`);
    console.log(`📄 Max pages per search: ${CONFIG.maxPagesPerSearch}`);
    console.log(`🎯 Max products per search: ${CONFIG.maxProductsPerSearch}`);
    console.log(`🎯 Target total: ${CONFIG.maxProductsTotal} products`);
    console.log(`📝 Detail scraping: ${CONFIG.scrapeDetailPages ? 'ENABLED' : 'DISABLED'}\n`);

    let browser;
    let allProducts = [];

    try {
        browser = await puppeteer.launch({
            headless: CONFIG.headless,
            ...stealthConfig,
            timeout: 60000,
        });

        console.log('✅ Browser launched');
        const page = await browser.newPage();
        await setupPage(page);

        const cookiesLoaded = await loadCookies(page);

        if (!cookiesLoaded) {
            console.log('\n📝 No cookies found, attempting to login...');
            const loginSuccess = await performLogin(page);
            if (!loginSuccess) {
                console.log('⚠️  Login failed, continuing anyway...');
            }
        } else {
            console.log('✅ Using existing cookies');
        }

        // Perform searches with pagination
        for (let i = 0; i < SEARCH_KEYWORDS.length; i++) {
            const searchInfo = SEARCH_KEYWORDS[i];
            const products = await performSearchWithPagination(page, searchInfo);
            allProducts = allProducts.concat(products);

            console.log(`📊 Total products so far: ${allProducts.length}`);

            if (allProducts.length >= CONFIG.maxProductsTotal) {
                console.log(`\n🎯 Reached target of ${CONFIG.maxProductsTotal} products!`);
                break;
            }

            if (i < SEARCH_KEYWORDS.length - 1) {
                const delay = CONFIG.searchDelay + Math.random() * 2000;
                console.log(`⏳ Waiting ${Math.round(delay/1000)}s before next search...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // Deduplication by Item ID
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔄 DEDUPLICATION (by Item ID)`);
        console.log(`${'='.repeat(60)}\n`);

        const uniqueProducts = [];
        const seenItemIds = new Set();

        for (const product of allProducts) {
            const itemId = product.itemId;
            if (!itemId && product.link) {
                const match = product.link.match(/[?&]id=(\d+)/);
                if (match) product.itemId = match[1];
            }

            const finalItemId = product.itemId;
            if (finalItemId && !seenItemIds.has(finalItemId)) {
                seenItemIds.add(finalItemId);
                uniqueProducts.push(product);
            }
        }

        console.log(`   Before: ${allProducts.length} products`);
        console.log(`   After: ${uniqueProducts.length} unique products`);
        console.log(`   Duplicates removed: ${allProducts.length - uniqueProducts.length}`);

        let finalProducts = uniqueProducts.slice(0, CONFIG.maxProductsTotal);
        
        // Scrape detail pages if enabled
        if (CONFIG.scrapeDetailPages) {
            finalProducts = await scrapeProductDetails(page, finalProducts);
        }

        // Statistics
        const categoryStats = {};
        const keywordStats = {};
        const pageStats = {};
        let detailsScrapedCount = 0;

        finalProducts.forEach(p => {
            const catName = p.categoryId || 'Unknown';
            const keyword = p.searchKeyword || 'Unknown';
            const pageNum = p.pageNumber || 1;
            categoryStats[catName] = (categoryStats[catName] || 0) + 1;
            keywordStats[keyword] = (keywordStats[keyword] || 0) + 1;
            pageStats[pageNum] = (pageStats[pageNum] || 0) + 1;
            if (p.detailsScraped) detailsScrapedCount++;
        });

        // Save results
        const data = {
            totalProducts: finalProducts.length,
            productsWithDetails: detailsScrapedCount,
            detailsCoverage: `${((detailsScrapedCount/finalProducts.length)*100).toFixed(1)}%`,
            scrapedAt: new Date().toISOString(),
            searchesPerformed: SEARCH_KEYWORDS.length,
            categoryBreakdown: categoryStats,
            keywordBreakdown: keywordStats,
            pageDistribution: pageStats,
            products: finalProducts
        };

        fs.writeFileSync(CONFIG.outputFile, JSON.stringify(data, null, 2), 'utf-8');

        console.log(`\n${'='.repeat(60)}`);
        console.log('✨ SCRAPING COMPLETED!');
        console.log(`${'='.repeat(60)}`);
        console.log(`📊 Total unique products: ${finalProducts.length}`);
        console.log(`📝 Products with detailed info: ${detailsScrapedCount} (${((detailsScrapedCount/finalProducts.length)*100).toFixed(1)}%)`);
        console.log(`💾 Saved to: ${CONFIG.outputFile}`);

        if (finalProducts.length > 0) {
            console.log(`\n📈 Products by category:`);
            Object.entries(categoryStats)
                .sort((a, b) => b[1] - a[1])
                .forEach(([cat, count]) => {
                    const percentage = ((count / finalProducts.length) * 100).toFixed(1);
                    console.log(`   ${cat}: ${count} products (${percentage}%)`);
                });

            console.log(`\n📄 Products by page number:`);
            Object.entries(pageStats)
                .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                .forEach(([pageNum, count]) => {
                    const percentage = ((count / finalProducts.length) * 100).toFixed(1);
                    console.log(`   Page ${pageNum}: ${count} products (${percentage}%)`);
                });

            console.log('\n📋 Sample products with details:');
            const samplesWithDetails = finalProducts.filter(p => p.detailsScraped).slice(0, 3);
            samplesWithDetails.forEach((product, idx) => {
                console.log(`\n${idx + 1}. [${product.searchKeyword}] ${product.title.substring(0, 60)}...`);
                console.log(`   Price: ¥${product.price}`);
                console.log(`   Item ID: ${product.itemId}`);
                console.log(`   Page: ${product.pageNumber}`);
                if (product.brand) console.log(`   Brand: ${product.brand}`);
                if (product.sales) console.log(`   Sales: ${product.sales}`);
                if (product.reviewsCount) console.log(`   Reviews: ${product.reviewsCount}`);
                if (product.rating) console.log(`   Rating: ${product.rating}`);
                if (product.specifications) {
                    console.log(`   Specifications: ${Object.keys(product.specifications).length} attributes`);
                }
                if (product.additionalImages) {
                    console.log(`   Images: ${product.additionalImages.length} additional images`);
                }
            });
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
    } finally {
        if (browser) {
            await browser.close();
            console.log('\n🔒 Browser closed');
        }
    }
}

main();
