#!/usr/bin/env node
import ora from 'ora';
import chalk from 'chalk';
import path from 'node:path';
import express from 'express';
import favicon from 'serve-favicon';
import bodyParser from 'body-parser';
import fs, { promises as fsPromise } from 'node:fs';
import { promises as readlinePromise } from 'node:readline';
import { exec } from 'node:child_process';
import { Configuration, OpenAIApi, ChatCompletionRequestMessageRoleEnum } from 'openai';
import {
  getSystemDownloadFolderPath,
  getAddress,
  dotenvConfig,
  isJSON,
  isObject,
  getPrefix,
  extractCommandLine,
} from './utils/index.js';
import {
  rootDir,
  exitKeywords,
  saveKeywords,
  cleanKeywords,
  readKeywords,
  serveKeywords,
  stopKeywords,
  helpKeywords,
  chatModeKeywords,
  cliModeKeywords,
  commandsOutput,
  cliModeSystem,
} from './utils/constant.js';
import request from './utils/request.js';

// 加载环境变量
if (!process.env.OPENAI_API_KEY) {
  const dotenvFiles = ['.env.local', '.env'];
  dotenvConfig(dotenvFiles);
}

// 初始化模式
let mode = 'chat mode'; // chat mode | cli mode

// 初始化模式提示前缀
let prefix = getPrefix(mode);

// 初始化对话模式历史记录
let chatLog = [];

// 初始化命令行模式历史记录
let cliLog = [cliModeSystem];

// 初始化接口服务
let server = null;

// 初始化控制台输入
const rlp = readlinePromise.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 初始化控制台loading
const spinner = ora('loading...');

// 初始化 Openai
const configuration = new Configuration({
  organization: process.env.ORGANIZATION_ID,
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

/**
 * @description 生成图片函数
 * @param {*} imgDesc
 * @return {Promise<{data: string[], err: Error}>}
 */
function imageGenerator(imgDesc) {
  return openai
    .createImage({
      prompt: imgDesc,
      response_format: 'url',
      n: 3,
    })
    .then((res) => {
      const { data } = res.data;
      return { data };
    })
    .catch((e) => {
      if (e.response) {
        const { error } = e.response.data;
        return { err: error };
      }
      return { err: e };
    });
}

/**
 * @description 对话生成函数
 * @param {'cli mode' | 'chat mode'} _mode
 * @param {any[]} messages
 * @return {Promise<{data: any[], err: Error}>}
 */
function chatCompletionGenerator(_mode, messages) {
  let temperature = 0.9; // 0-2 之间的浮点数，表示模型生成文本的创造性程度 0最保守 2最大创造性
  if (_mode === 'cli mode') {
    // 命令行模式下，创造性程度最低，需要严格按照system限定输出
    temperature = 0;
  }
  return openai
    .createChatCompletion({
      model: 'gpt-3.5-turbo-0301',
      messages,
      temperature,
    })
    .then((res) => {
      const { choices } = res.data;
      return { data: choices };
    })
    .catch((e) => {
      if (e.response) {
        const { error } = e.response.data;
        return { err: error };
      }
      return { err: e };
    });
}

/**
 * @description 创建接口服务
 * @export
 * @param {string} port
 * @return {Promise<{data: import('http').Server, err: Error}>}
 */
export function serverGenerator(port) {
  const serverPromise = new Promise((resolve, reject) => {
    try {
      const app = express();
      app.use(express.static(path.join(rootDir, 'public')));
      app.use(favicon(path.join(rootDir, 'public', 'favicon.ico')));
      app.use(bodyParser.json());
      app.use(bodyParser.urlencoded({ extended: true }));
      app.all('/proxy/*', async (req, res) => {
        try {
          const { method, params } = req;
          const url = params['0'];
          const response = await request({
            url: `https://${url}`,
            method,
            params: req.query,
            data: req.body,
            headers: req.headers,
          });
          res.setHeader('Content-Type', 'application/json');
          res.send(response.data);
        } catch (error) {
          console.log(chalk.bgRed('\n\n服务器错误\n'));
          console.error(error);
          console.log('\n');
          res.setHeader('Content-Type', 'text/html');
          if (error.response) {
            const { status, data } = error.response;
            if (isJSON(data) || isObject(data)) {
              res.setHeader('Content-Type', 'application/json');
            }
            res.status(status).send(data);
            return;
          }
          res.status(500).send(`Internal Server Error: ${error.message}`);
        }
      });
      const expressServer = app.listen(port, () => {
        resolve(expressServer);
      });
      expressServer.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });

  return serverPromise.then((expressServer) => ({ data: expressServer })).catch((err) => ({ err }));
}

/**
 * @description 命令行生成函数
 * @export
 * @param {string} command
 * @return {Promise<{data: string, err: Error}>}
 */
export function commandGenerator(command) {
  const commandPromise = new Promise((resolve, reject) => {
    try {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        if (stderr) {
          reject(new Error(stderr));
          return;
        }
        resolve(stdout);
      });
    } catch (err) {
      reject(err);
    }
  });

  return commandPromise.then((stdout) => ({ data: stdout })).catch((err) => ({ err }));
}

/**
 * @description 执行命令函数
 * @export
 * @param {string} command
 * @return {*}
 */
export async function execCommand(command) {
  const answer = await rlp.question(` -- ${chalk.red('是否执行？')} (Y/N/E)：`);
  const v = answer.trim().toLowerCase();
  if (v === 'y') {
    const { data, err } = await commandGenerator(command);
    if (err) {
      console.log(`${chalk.bgRed('\n命令执行失败')} => ${err.message}\n`);
      return;
    }
    console.log(chalk.bgGreen('\n命令执行成功\n'));
    console.log(data);
    return;
  }
  if (v === 'n') {
    // 不执行命令
    console.log(chalk.bgGray('\n命令已取消\n'));
    return;
  }
  if (v === 'e') {
    // 编辑命令
    setTimeout(() => {
      rlp.write(command);
    }, 0);
    const newCommand = await rlp.question(`\n -- ${chalk.blue('编辑命令')}：`);
    const { data, err } = await commandGenerator(newCommand);
    if (err) {
      console.log(`${chalk.bgRed('\n命令执行失败')} => ${err.message}\n`);
      return;
    }
    console.log(chalk.bgGreen('\n命令执行成功\n'));
    console.log(data);
    return;
  }

  console.log(chalk.bgRed('\n命令未执行：非法字符\n'));
}

/**
 * @description 控制台对话函数
 * @return {*}
 */
async function chat() {
  const answer = await rlp.question(`${prefix} 请输入：`);

  if (chatModeKeywords.includes(answer)) {
    if (mode === 'chat mode') {
      console.log(chalk.bgRed('\n ChatGPT 已经处于对话模式 \n'));
      chat();
      return;
    }
    console.log(chalk.bgGreen('\n ChatGPT 已切换到对话模式 \n'));
    mode = 'chat mode';
    prefix = getPrefix(mode);
    chat();
    return;
  }

  if (cliModeKeywords.includes(answer)) {
    if (mode === 'cli mode') {
      console.log(chalk.bgRed('\n ChatGPT 已经处于命令行模式 \n'));
      chat();
      return;
    }
    console.log(chalk.bgGreen('\n ChatGPT 已切换到命令行模式 \n'));
    mode = 'cli mode';
    prefix = getPrefix(mode);
    chat();
    return;
  }

  if (exitKeywords.includes(answer)) {
    if (server) {
      server.close((err) => {
        if (err) process.exit(1);
        console.log(chalk.bgRed('\n ChatGPT 退出会话 \n'));
        server = null;
        rlp.close();
      });
      return;
    }
    console.log(chalk.bgRed('\n ChatGPT 退出会话 \n'));
    rlp.close();
    return;
  }

  if (cleanKeywords.includes(answer)) {
    // 设置初始状态
    chatLog = [];
    cliLog = [cliModeSystem];
    // 清屏并提示
    console.clear();
    console.log(chalk.bgGreen('\n ChatGPT 已经清空会话历史 \n'));
    chat();
    return;
  }

  if (saveKeywords.includes(answer)) {
    const downloadDir = getSystemDownloadFolderPath();
    const chatLogString = JSON.stringify(chatLog);
    const chatFilePath = path.join(downloadDir, 'chat-log.json');
    await fsPromise.writeFile(chatFilePath, chatLogString, { encoding: 'utf-8' });
    console.log(`${chalk.bgGreen('\n ChatGPT 已保存对话历史：')} => ${chatFilePath}\n`);
    const cliLogString = JSON.stringify(cliLog);
    const cliFilePath = path.join(downloadDir, 'cli-log.json');
    await fsPromise.writeFile(cliFilePath, cliLogString, { encoding: 'utf-8' });
    console.log(`${chalk.bgGreen('\n ChatGPT 已保存命令行历史：')} => ${cliFilePath}\n`);
    chat();
    return;
  }

  if (readKeywords.includes(answer)) {
    const inputPath = await rlp.question(chalk.greenBright('\n请输入读取文件路径(*.json)：'));
    if (fs.existsSync(inputPath)) {
      const json = await fsPromise.readFile(inputPath, { encoding: 'utf-8' });
      const readLog = JSON.parse(json);
      // 判断会话mode
      const { role, content } = cliModeSystem;
      const isCliMode = readLog.filter((l) => l.content === content && l.role === role).length > 0;
      if (isCliMode) {
        mode = 'cli mode';
        prefix = getPrefix(mode);
        cliLog = cliLog.concat(readLog);
      } else {
        mode = 'chat mode';
        prefix = getPrefix(mode);
        chatLog = chatLog.concat(readLog);
      }
      console.log(chalk.bgGreen(`\n ChatGPT 已读取${chalk.bgGray(prefix)}历史\n`));
    } else {
      console.log(chalk.bgRed('\n ChatGPT 读取文件不存在 \n'));
    }
    chat();
    return;
  }

  if (serveKeywords.includes(answer)) {
    if (!server) {
      const inputPort = (await rlp.question(chalk.greenBright('\n请输入服务端口号(3000)：'))) || 3000;
      const res = await serverGenerator(inputPort);
      if (res.err) {
        console.log(chalk.bgRed('\n ChatGPT 代理服务启动失败 \n'));
        console.log(`${res.err.message}\n`);
        chat();
        return;
      }
      server = res.data;
    }
    const ip = getAddress()[0];
    const { port } = server.address();
    console.log(
      `\n${chalk.bgGreen('ChatGPT 代理服务已经启动')}\n
      ${chalk.green('On Your Network')}: http://${ip}:${port}\n
      ${chalk.green('Local')}:           http://localhost:${port}\n
      ${chalk.green('使用方法')}:\n
      ChatGPT 接口代理: http://localhost:${port}/proxy/<openai接口地址>\n
      例如: http://localhost:${port}/proxy/api.openai.com/v1/completions\n`,
    );
    chat();
    return;
  }

  if (stopKeywords.includes(answer)) {
    if (server) {
      server.close((err) => {
        if (err) process.exit(1);
        console.log(chalk.bgRed('\n ChatGPT 代理服务已经关闭 \n'));
        server = null;
        chat();
      });
      return;
    }
    console.log(chalk.bgRed('\n ChatGPT 没有启动代理服务 \n'));
    chat();
    return;
  }

  if (helpKeywords.includes(answer)) {
    console.log(`\n以下是 ChatGPT 指令大全${commandsOutput}`);
    chat();
    return;
  }

  if (answer.indexOf('\\img') === 0) {
    spinner.start();
    const imgDesc = answer.replace('\\img', '').trim();
    const { data, err } = await imageGenerator(imgDesc);
    spinner.stop();
    if (data) {
      const imagePaths = data.map((v, i) => `[${i + 1}] ${v.url}`).join(' \n');
      console.log(
        `\n${chalk.bgGreen('ChatGPT 生成图片成功')} => 生成 ${data.length} 张图片：\n${imagePaths}\n`,
      );
    } else {
      console.log(`\n${chalk.bgRed('ChatGPT 生成图片失败')} => ${err.type || 'Error'}: ${err.message}\n`);
    }
    chat();
    return;
  }

  spinner.start();

  const input = {
    role: ChatCompletionRequestMessageRoleEnum.User,
    content: answer,
  };

  let messages = [];

  if (mode === 'cli mode') {
    cliLog.push(input);
    messages = cliLog;
  } else if (mode === 'chat mode') {
    chatLog.push(input);
    messages = chatLog;
  }

  const { data, err } = await chatCompletionGenerator(mode, messages);

  spinner.stop();

  // 输出回答并记录历史
  if (data && Array.isArray(data)) {
    data.forEach((choice) => {
      const { role, content } = choice.message;
      console.log(`${chalk.yellowBright(`\n ChatGPT ${role}: `) + content}\n`);
      const output = {
        role,
        content,
      };
      if (mode === 'cli mode') {
        // 万一答案里不止有命令行，还有其他内容，需要提取命令行
        const command = extractCommandLine(content) || 'UNKNOWN';
        cliLog.push({
          ...output,
          content: command,
        });
      } else if (mode === 'chat mode') {
        chatLog.push(output);
      }
    });
  } else {
    console.log(`\n${chalk.bgRed('ChatGPT 生成对话失败')} => ${err.type || 'Error'}: ${err.message}\n`);
  }

  // 命令行模式下，执行命令行
  if (mode === 'cli mode') {
    const command = cliLog[cliLog.length - 1].content;
    if (command !== 'UNKNOWN') {
      // 执行命令行
      await execCommand(command.replace('>', ''));
    }
  }

  chat();
}

console.log(
  `${chalk.bgBlue('ChatGPT:')} 你好，我是 ChatGPT！你可以和我聊天。${commandsOutput}⚡ 开始聊天吧！\n`,
);

// 执行控制台对话
chat();
