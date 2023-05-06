/* eslint-disable no-restricted-syntax */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';

const rootDir = path.resolve(process.argv[1], '..');

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
