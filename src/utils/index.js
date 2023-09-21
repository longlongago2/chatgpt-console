import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import { rootDir, chatModeKeywords, cliModeKeywords } from './constant.js';

export function getSystemDownloadFolderPath() {
  const homeDir = os.homedir();
  const downloadDir = path.join(homeDir, 'Downloads');
  if (fs.existsSync(downloadDir)) {
    return downloadDir;
  }
  return os.homedir();
}

export function getAddress() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  Object.entries(interfaces).forEach(([, interfaceInfo]) => {
    if (interfaceInfo) {
      interfaceInfo.forEach((item) => {
        if (item.family === 'IPv4' && !item.internal) {
          addresses.push(item.address);
        }
      });
    }
  });
  return addresses;
}

export function dotenvConfig(dotenvFiles = []) {
  dotenvFiles.forEach((dotenvFile) => {
    const file = path.join(rootDir, dotenvFile);
    if (fs.existsSync(file)) {
      dotenv.config({ path: file });
    }
  });
}

export function isJSON(str) {
  if (typeof str === 'string') {
    try {
      const obj = JSON.parse(str);
      if (typeof obj === 'object' && obj) {
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
  return false;
}

export function isJSONFile(filePath) {
  try {
    JSON.parse(fs.readFileSync(filePath).toString());
    return true;
  } catch (error) {
    return false;
  }
}

export function isObject(obj) {
  return Object.prototype.toString.call(obj).indexOf('Object') > -1;
}

export function getPrefix(mode) {
  let prefix = '';
  if (mode === 'chat mode') {
    prefix = chalk.greenBright(`[${chatModeKeywords[0]}]`);
  } else if (mode === 'cli mode') {
    prefix = chalk.greenBright(`[${cliModeKeywords[0]}]`);
  }
  return prefix;
}

/**
 * @description: 提取命令行
 * @export
 * @param {string} text e.g. ">tree"
 */
export function extractCommandLine(text) {
  const regex = />.*$/m;
  const match = text.match(regex);
  if (match) {
    return match[0];
  }
  return null;
}

/**
 * @description format：YYYY-MM-DD HH:mm:ss
 * @export
 * @return {string}
 */
export function getDateTime() {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const strDate = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  const formatNumber = (n) => {
    const s = n.toString();
    return s[1] ? s : `0${s}`;
  };
  return `${year}-${formatNumber(month)}-${formatNumber(strDate)} ${formatNumber(hour)}:${formatNumber(
    minute,
  )}:${formatNumber(second)}`;
}
