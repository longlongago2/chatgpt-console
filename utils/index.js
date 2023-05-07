/* eslint-disable no-restricted-syntax */
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
  for (const name of Object.keys(interfaces)) {
    for (const interfaceInfo of interfaces[name]) {
      if (interfaceInfo.family === 'IPv4' && !interfaceInfo.internal) {
        addresses.push(interfaceInfo.address);
      }
    }
  }
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
 * @param {string} str e.g. ">tree"
 * @return {boolean}
 */
export function extractCommandLine(text) {
  const regex = />.*$/m;
  const match = text.match(regex);
  if (match) {
    return match[0];
  }
  return null;
}
