#!/usr/bin/env node
import chalk from 'chalk';
import { chat } from './src/index.js';
import { packageInfo } from './src/utils/constant.js';

console.log(
  `\n🤖 你好，我是 ${chalk.bgRed(` ChatGPT terminal v${packageInfo.version} `)}，输入 ${chalk.green(
    'help',
  )} 查看帮助，马上开启聊天吧！⚡\n`,
);

chat();
