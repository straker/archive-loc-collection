import path from 'node:path';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import XLSX from 'xlsx';
import playwright from 'playwright';
import prettify from 'html-prettify';
import chalk from 'chalk';
import cliProgress from 'cli-progress';

const locBasePath = 'https://www.loc.gov';
const locCollectionPath = '/collections';
const locUrl = new URL(locBasePath);

// e.g. (24.1 MB) or (300x300 px)
const fileSizeRegex = /\((?<size>[\d.x]+)\s*(?<type>\w+)\)/;

// CSS selectors used for page.locator
const locators = {
  aboutArticle: '#article',
  collectionName: '#page-title h1 span',
  collectionResults: '#results li div.description a',
  itemDownloads: '#select-resource0 option',
  itemSequenceDownload: '#download option',
  itemFormatList: '#item-online_format + ul',
  itemFormats: '#item-online_format + ul li',
  itemCallNumber: '#item-call_number + ul',
  itemManifest: '#item-iiif-presentation-manifest + ul a',
  itemNameList: '#item-contributor_names + ul',
  itemNames: '#item-contributor_names + ul li',
  itemNoteList: '#item-notes + ul',
  itemNotes: '#item-notes + ul li',
  itemOtherTitle: '#item-other_title + ul',
  itemSummary: '#item-summary + ul',
  itemTitle: '#item-title + ul'
};

const collectionAoa = [
  [
    'Title',
    'Other Title',
    'Summary',
    'Names',
    'Notes',
    'Call Number',
    'Format',
    'Filename'
  ]
];
const collectionErrorsAoa = [['Url', 'Error']];

export async function saveCollection(collectionArg, dest) {
  let collectionSlug;
  try {
    const url = new URL(collectionArg);
    collectionSlug = url.pathname.split('/')[2];
  } catch {
    collectionSlug = collectionArg;
  }

  const { collectionUrl } = getCollectionUrl(collectionSlug);
  const browser = await playwright.chromium.launch({
    headless: true
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const response = await page.goto(collectionUrl);
    if (!response.ok()) {
      throw new Error(`Unable to access collection ${collectionUrl}`);
    }

    await mkdir(path.join(dest, collectionSlug), { recursive: true });
    const collectionName = await page
      .locator(locators.collectionName)
      .first()
      .innerText();

    // save about page
    const aboutPage = await getAboutPage(
      page,
      collectionSlug,
      collectionName
    );
    await writeFile(
      path.join(collectionSlug, 'about.md'),
      aboutPage,
      'utf8'
    );

    // save all the data from the collection
    const errors = [];
    const progressBar = new cliProgress.SingleBar(
      {},
      cliProgress.Presets.shades_classic
    );
    const itemUrls = await getCollectionItemUrls(
      page,
      collectionSlug
    );
    console.log(
      chalk.blue(
        `Archiving ${itemUrls.length} items from the collection of:`
      )
    );
    console.log(collectionName);

    process.on('SIGINT', () => {
      progressBar.stop();
      saveArchivalDataToFile(collectionSlug, errors);
      return process.exit(1);
    });

    try {
      // TODO: should be able to stop in the middle of a download and then
      // pick back up where it left off (instead of starting from the beginning)
      progressBar.start(itemUrls.length, 0);
      for (const itemUrl of itemUrls) {
        // console.log(itemUrl);
        try {
          const data = await getItemArchivalData(
            page,
            itemUrl,
            collectionSlug
          );
          collectionAoa.push(data.flat());
        } catch (err) {
          collectionErrorsAoa.push([itemUrl, err]);
        }
        // console.log(data);
        progressBar.increment();
      }
    } finally {
      // ensure to save the state of the collection archival data if
      // any problems occur
      progressBar.stop();
      console.log(chalk.green('Collection archival complete'));
      saveArchivalDataToFile(collectionSlug, errors);
    }
  } finally {
    await browser.close();
  }
}

/**
 * Save the archival data to a spreadsheet.
 * @param {string} collectionSlug - Slug of the collection
 * @param {string[][]} errors - List of URLs and errors
 */
function saveArchivalDataToFile(collectionSlug, errors) {
  const workbook = XLSX.utils.book_new();

  const collectionWorksheet = XLSX.utils.aoa_to_sheet(collectionAoa);
  XLSX.utils.book_append_sheet(
    workbook,
    collectionWorksheet,
    'Collection'
  );

  if (errors.length) {
    console.log(
      chalk.red('Some collection items could not be archived:')
    );
    collectionErrorsAoa[0]
      .slice(1)
      .map(([url, err]) => console.log(chalk.red(`${url}:`, err)));

    const errorWorksheet = XLSX.utils.aoa_to_sheet(
      collectionErrorsAoa
    );
    XLSX.utils.book_append_sheet(workbook, errorWorksheet, 'Errors');
  }

  XLSX.writeFile(
    workbook,
    path.join(collectionSlug, `${collectionSlug}.xlsx`)
  );
}

/**
 * Download a file to the specified filepath.
 * @param {string} url - URL of the file to download
 * @param {string} filepath - Filepath to save the file
 * @see https://stackoverflow.com/a/74722818/2124254
 */
async function download(url, filepath) {
  const stream = fs.createWriteStream(filepath);
  const { body } = await fetch(url);
  return finished(Readable.fromWeb(body).pipe(stream));
}

/**
 * Return the url to the collection or subpage
 * @param {string} collectionSlug - Slug of the collection
 * @param {object} [options]
 * @param {string} [options.subpage] - Name of the subpage to navigate to
 * @param {string} [options.search] - Search params of the page
 */
function getCollectionUrl(
  collectionSlug,
  { subpage = '', search = '' } = {}
) {
  // when trying to construct a URL, don't use path.join by itself since
  // different operating systems use different deliminators. instead use
  // URL.pathname with path.join which will handle any incorrect URL
  // deliminators for us
  // @see https://stackoverflow.com/a/63048233/2124254
  locUrl.pathname = path.join(locCollectionPath, collectionSlug);
  locUrl.search = '';
  const collectionUrl = locUrl.href;

  locUrl.pathname = path.join(
    locCollectionPath,
    collectionSlug,
    subpage
  );
  locUrl.search = search;
  const pageUrl = locUrl.href;

  return {
    collectionUrl,
    pageUrl
  };
}

/**
 * Get current date in YYYY-MM-DD format, taking into account timezone.
 * @see https://stackoverflow.com/a/29774197/2124254
 */
function getDate() {
  let today = new Date();
  const offset = today.getTimezoneOffset();
  today = new Date(today.getTime() - offset * 60 * 1000);
  return today.toISOString().split('T')[0];
}

/**
 * Get a list of all collection item urls.
 * @param {Page} page - Playwright Page object
 * @param {string} collectionSlug - Slug of the collection
 */
async function getCollectionItemUrls(page, collectionSlug) {
  const items = [];

  // try to put all the collection items onto a single page
  const { pageUrl } = getCollectionUrl(
    collectionSlug,
    { search: `st=list&c=1000` } // does a collection have more than 1k items?
  );
  const response = await page.goto(pageUrl);
  if (!response.ok()) {
    throw new Error(
      `Unable to navigate to collection results page ${pageUrl}`
    );
  }

  const collectionItems = await page
    .locator(locators.collectionResults)
    .all();
  for (const item of collectionItems) {
    const url = await item.getAttribute('href');
    // some items in the collection are not items we should save
    // (web pages, the collection itself, articles, etc.)
    if (url.includes('loc.gov/item')) {
      items.push(url);
    }
  }

  return items;
}

/**
 * Return the locator innerText if it exists, otherwise return an empty string
 * @param {Page} page - Playwright Page object
 * @param {string} selector - CSS selector of the element
 */
async function getLocatorInnerText(page, selector) {
  const locator = await page.locator(selector);
  if (await locator.isVisible()) {
    return await locator.innerText();
  }

  return '';
}

/**
 * Normalize a file size (dimensions or disk size).
 * @param {number} size - Current size
 * @param {string} type - Type of the size (kb, mb, gb)
 */
function normalizeSize(size, type) {
  type = type.toLowerCase();

  if (type === 'kb') {
    return size * 1_024;
  } else if (type === 'mb') {
    return size * 1_048_576;
  } else if (type === 'gb') {
    return size * 1_073_741_824;
  } else if (type === 'px') {
    const [width, height] = size.split('x');
    return width * height;
  }

  return size;
}

/**
 * Get a collection item's archival information.
 * @param {Page} page - Playwright Page object
 * @param {string} itemUrl - URL of the collection item
 * @param {string} collectionSlug - Slug of the collection
 */
async function getItemArchivalData(page, itemUrl, collectionSlug) {
  const response = await page.goto(itemUrl);
  if (!response.ok()) {
    throw new Error(
      `${response.status()}: Unable to navigate to item`
    );
  }

  // TODO:
  // item is a sequence of items that we need to get
  // const manifestLink = await page.locator(locators.itemManifest);
  // if (!inSequence && await manifestLink.isVisible()) {
  //   const url = await manifestLink.getAttribute('href');

  //   console.log(url);
  //   console.log((await httpRequest(url)))

  //   // TODO: files in a sequence should be saved into their own folder, and
  //   // the  filename be in sequential order (they are all saved as
  //   // default.jpg)
  //   const manifest = JSON.parse(await httpRequest(url));
  //   console.log({manifest});
  //   const items = [];
  //   for (const { metadata } of manifest.sequences[0].canvases) {
  //     console.log(metadata[0].value)
  //     const itemData = await getItemArchivalData(
  //       page, metadata[0].value, collectionSlug, true
  //     );
  //     items.push(itemData);
  //   }
  //   return items;
  // }

  const title = await getLocatorInnerText(page, locators.itemTitle);
  const otherTitle = await getLocatorInnerText(
    page,
    locators.itemOtherTitle
  );
  const summary = await getLocatorInnerText(
    page,
    locators.itemSummary
  );
  const callNumber = await getLocatorInnerText(
    page,
    locators.itemCallNumber
  );

  let names = [];
  if (await page.locator(locators.itemNameList).isVisible()) {
    for (const name of await page.locator(locators.itemNames).all()) {
      names.push(await name.innerText());
    }
  }
  names = names.join('\n');

  let notes = [];
  if (await page.locator(locators.itemNoteList).isVisible()) {
    for (const note of await page.locator(locators.itemNotes).all()) {
      notes.push(await note.innerText());
    }
  }
  notes = notes.join('\n');

  const { format, fileName } = await downloadCollectionItem(
    page,
    itemUrl,
    collectionSlug
  );

  return [
    title,
    otherTitle,
    summary,
    names,
    notes,
    callNumber,
    format,
    fileName
  ];
}

/**
 * Download a collection item.
 * @param {Page} page - Playwright Page object
 * @param {string} itemUrl - URL of the collection item
 * @param {string} collectionSlug - Slug of the collection
 */
async function downloadCollectionItem(page, itemUrl, collectionSlug) {
  // find the correct format of the item and download it
  if (!(await page.locator(locators.itemFormatList).isVisible())) {
    throw new Error(`Unable to determine format`);
  }
  const hasFormats = [];
  const itemFormats = await page.locator(locators.itemFormats).all();
  for (const itemFormat of itemFormats) {
    const formatType = await itemFormat.innerText();
    if (['image', 'audio', 'video'].includes(formatType)) {
      hasFormats.push(formatType);
    }
  }

  if (!hasFormats.length) {
    throw new Error(`Unrecognized item format`);
  }

  // prefer video and audio over images
  let format = '';
  let fileTypes = [];
  if (hasFormats.includes('video')) {
    format = 'video';
    fileTypes.push('video');
  } else if (hasFormats.includes('audio')) {
    format = 'audio';
    fileTypes.push('audio');
  } else {
    format = 'image';
    fileTypes.push('jpeg');
  }

  // find largest file of matching type to download
  let itemDownloadUrl = '';
  let largestSize = 0;
  const downloadOptions = await page
    .locator(locators.itemDownloads)
    .all();
  for (const option of downloadOptions) {
    const type = (
      await option.getAttribute('data-file-download')
    ).toLowerCase();
    if (fileTypes.includes(type)) {
      const url = await option.getAttribute('value');
      const { size, type } = (await option.innerText()).match(
        fileSizeRegex
      ).groups;
      const normalizedSize = normalizeSize(size, type);

      if (normalizedSize > largestSize) {
        largestSize = normalizedSize;
        itemDownloadUrl = url;
      }
    }
  }

  // console.log({ format, fileTypes, collectionSlug, itemDownloadUrl });
  if (!itemDownloadUrl) {
    throw new Error(
      `Unable to find suitable downloadable file with "${format}" format`
    );
  }

  // save file
  const fileName = path.basename(itemDownloadUrl);
  await download(
    itemDownloadUrl,
    path.join(collectionSlug, fileName)
  );

  return { format, fileName };
}

/**
 * Get the HTML of the about collection page, if it exists.
 * @param {Page} page - Playwright Page object
 * @param {string} collectionSlug - Slug of the collection
 * @param {string} collectionName - Name of the collection
 */
async function getAboutPage(page, collectionSlug, collectionName) {
  const { collectionUrl, pageUrl } = getCollectionUrl(
    collectionSlug,
    { subpage: 'about-this-collection' }
  );
  const meta = `<h1>${collectionName}</h1>
<ul>
  <li>
    Original collection url: <a href="${collectionUrl}">${collectionUrl}</a>
  </li>
  <li>
    Downloaded on:
    <time datetime="${new Date().toISOString()}">${getDate()}</time>
  </li>
</ul>`;

  const response = await page.goto(pageUrl);
  if (!response.ok()) {
    return meta;
  }

  const article = prettify(
    await page.locator(locators.aboutArticle).innerHTML()
  );
  return `${meta}
<article>
  ${article}
</article>`;
}
