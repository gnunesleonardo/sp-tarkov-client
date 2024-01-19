﻿import { app, ipcMain } from 'electron';
import { Browser, launch, Page } from 'puppeteer';
import axios from 'axios';
import { GithubRelease } from '../../shared/models/github.model';
import { LinkModel } from '../../shared/models/aki-core.model';
import { install, Browser as Browsers } from '@puppeteer/browsers';

export interface GithubLinkData {
  userName: string;
  repoName: string;
  tag: string;
}

export const handleDownloadLinkEvent = (isServe: boolean) => {
  ipcMain.on('download-link', async (event, linkModel: LinkModel) => {
    let downloadLink = null;

    if (!isServe) {
      await install({
        browser: Browsers.CHROME,
        buildId: '119.0.6045.105',
        cacheDir: `${app.getPath('home')}/.local-chromium`,
      });
    }

    await (async () => {
      let browser: Browser;

      if (isServe) {
        browser = await launch({ headless: 'new' });
      } else {
        browser = await launch({
          headless: 'new',
          executablePath: `${app.getPath('home')}/.local-chromium/chrome/win64-119.0.6045.105/chrome-win64/chrome.exe`,
        });
      }

      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on('request', req => {
        if (
          req.resourceType() === 'stylesheet' ||
          req.resourceType() === 'font' ||
          req.resourceType() === 'image' ||
          req.resourceType() === 'media'
        ) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.goto(`https://hub.sp-tarkov.com/files/license/${linkModel.fileId}`, { waitUntil: 'networkidle2' });
      await page.click('[name="confirm"]');
      await page.click('div.formSubmit input[type="submit"]');

      page.on('response', response => {
        const status = response.status();
        if (status >= 300 && status <= 399) {
          if (response.headers()['location'].includes('dev.sp-tarkov.com/attachments')) {
            downloadLink = response.headers()['location'];
            event.sender.send('download-link-completed', downloadLink);
            browser.close();
          }
        }
      });

      await page.goto(`https://hub.sp-tarkov.com/files/file/${linkModel.fileId}`, { waitUntil: 'networkidle2' });
      await page.click('a.button.buttonPrimary.externalURL');

      const newPagePromise = getNewPageWhenLoaded(browser);
      const newPage: Page = await newPagePromise;

      downloadLink = await newPage.$eval('a[href]', e => e.getAttribute('href'));
      if (!downloadLink) {
        await browser.close();
        return;
      }

      const isDirectDllLink = isDirectDll(downloadLink);
      if (isDirectDllLink) {
        event.sender.send('download-link-completed', downloadLink);
        await browser.close();
        return;
      }

      const isArchiveLink = isArchiveURL(downloadLink);
      if (!isArchiveLink) {
        const gitHubInformation = parseGitHubLink(downloadLink);
        if (!gitHubInformation) {
          //  TODO Error Handling
          // await browser.close();
          return;
        }

        await getReleaseData(gitHubInformation)
          .then(async data => {
            const githubDownloadLink = data?.assets?.[0].browser_download_url;

            event.sender.send('download-link-completed', githubDownloadLink);
            await browser.close();

            return;
          })
          .catch(err => console.error(err));
      }

      event.sender.send('download-link-completed', downloadLink);
      await browser.close();
    })();
  });
};

const getNewPageWhenLoaded = async (browser: Browser) => {
  return new Promise<Page>(x =>
    browser.on('targetcreated', async target => {
      if (target.type() === 'page') {
        const newPage = await target.page();
        if (!newPage) return;

        const newPagePromise = new Promise<Page>(y => newPage.once('domcontentloaded', () => y(newPage)));
        const isPageLoaded = await newPage.evaluate(() => document.readyState);
        return isPageLoaded.match('complete|interactive') ? x(newPage) : x(newPagePromise);
      }
    })
  );
};

function isArchiveURL(url: string): boolean {
  const extensions = ['zip', 'rar', '7z', 'tar', 'gz'];

  const urlSegments = url.split('/');
  const fileName = urlSegments[urlSegments.length - 1];

  const fileSegments = fileName.split('.');
  const fileExtension = fileSegments[fileSegments.length - 1];

  return extensions.includes(fileExtension);
}

function isDirectDll(downloadLink: string) {
  return downloadLink.endsWith('.dll');
}

function parseGitHubLink(url: string): GithubLinkData | null {
  const regex = /https:\/\/github\.com\/(.*?)\/(.*?)\/releases\/tag\/(.*)/;
  const matches = url.match(regex);

  if (matches && matches.length === 4) {
    return {
      userName: matches[1],
      repoName: matches[2],
      tag: matches[3],
    };
  } else {
    return null;
  }
}

async function getReleaseData({ tag, userName, repoName }: GithubLinkData) {
  const url = `https://api.github.com/repos/${userName}/${repoName}/releases/tags/${tag}`;

  try {
    const response = await axios.get<GithubRelease>(url);
    console.log('X-RateLimit-Remaining:', response.headers['x-ratelimit-remaining']);
    console.log('X-RateLimit-Reset:', response.headers['x-ratelimit-reset']);
    console.log('X-RateLimit-Limit:', response.headers['x-ratelimit-limit']);
    console.log('X-RateLimit-Used:', response.headers['x-ratelimit-used']);

    return response.data;
  } catch (error) {
    console.error(error);
    return null;
  }
}
