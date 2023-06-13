#!/usr/bin/env node
import ora from 'ora';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import fsPromise from 'node:fs/promises';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import express from 'express';
import favicon from 'serve-favicon';
import bodyParser from 'body-parser';
import { Configuration, OpenAIApi, ChatCompletionRequestMessageRoleEnum } from 'openai';
import {
  getSystemDownloadFolderPath,
  getAddress,
  dotenvConfig,
  isJSON,
  getPrefix,
  extractCommandLine,
  isJSONFile,
  getDateTime,
} from './utils/index.js';
import {
  rootDir,
  packageInfo,
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
  cliDefinition,
  cliUserDefinition,
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
let cliLog = [cliDefinition, cliUserDefinition];

// 初始化接口服务
let server = null;

// 初始化控制台输入
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
  historySize: 150,
  removeHistoryDuplicates: true,
});

rl.on('history', (history) => {
  if (rl.preventHistory) history.shift();
});

// 初始化控制台loading
const spinner = ora({
  text: 'loading...',
  discardStdin: false,
});

// 初始化 Openai
const { OPENAI_API_KEY, ORGANIZATION_ID, CHATGPT_REGISTRY } = process.env;
const config = { apiKey: OPENAI_API_KEY };
if (ORGANIZATION_ID) config.organization = ORGANIZATION_ID;
if (CHATGPT_REGISTRY) {
  config.basePath = CHATGPT_REGISTRY;
  console.log(`\n${chalk.green('ChatGPT API Registry')}: ${CHATGPT_REGISTRY}\n`);
}

const configuration = new Configuration(config);

const openai = new OpenAIApi(configuration);

/**
 * @description 控制台问答函数
 * @param {string} qes 问题内容
 * @return {Promise<string>}
 */
function askQuestion(qes) {
  return new Promise((resolve, reject) => {
    try {
      rl.question(qes, (answer) => {
        resolve(answer);
      });
    } catch (error) {
      reject(error);
    }
  });
}

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
function chatCompletionGenerator(_mode, messages, stream = false) {
  let temperature = 1; // 0-2 之间的浮点数，表示模型生成文本的创造性程度 0最保守 2最大创造性
  if (_mode === 'cli mode') {
    // 命令行模式下，创造性程度最低，需要严格按照system限定输出
    temperature = 0;
  }
  return openai
    .createChatCompletion(
      {
        model: 'gpt-3.5-turbo-0301',
        messages,
        temperature,
        n: 1, // 只生成一个结果 choices.length === 1
        stream,
      },
      {
        responseType: stream ? 'stream' : 'json',
      },
    )
    .then((res) => {
      if (stream) return { data: res.data };
      return { data: res.data.choices };
    })
    .catch((e) => {
      if (e.response) {
        if (stream) {
          const { status, statusText } = e.response;
          return { err: new Error(`${statusText}(${status})`) };
        }
        const { error } = e.response.data;
        return { err: error };
      }
      return { err: e };
    });
}

/**
 * @description 处理接口流式数据
 * @param {import('stream').Stream} stream
 * @param {Function} [onOutput] 输出回调
 * @return {Promise<void>}
 */
function streamPromise(stream, onOutput) {
  const promise = new Promise((resolve, reject) => {
    let _role;
    let _content = '';
    try {
      stream.on('data', (chunk) => {
        const payloads = chunk.toString().split('\n\n');
        payloads.forEach((payload) => {
          if (payload.includes('[DONE]')) {
            if (onOutput) onOutput('\n\n');
            return;
          }
          if (payload.startsWith('data:')) {
            let data;
            try {
              data = JSON.parse(payload.replace('data: ', ''));
            } catch (err) {
              data = null;
            }
            if (!data) return;
            const { role, content } = data.choices?.[0]?.delta ?? {};
            if (role) _role = role;
            if (content) {
              _content += content;
              if (onOutput) onOutput(content);
            }
          }
        });
      });
      stream.on('end', () => {
        const message = { role: _role, content: _content };
        resolve(message);
      });
      stream.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
  return promise.then((message) => ({ data: message })).catch((err) => ({ err }));
}

/**
 * @description 创建接口服务
 * @export
 * @param {string} port
 * @param {{onRequest: (req: import('express').Request) => void, onError: (err: Error) => void}}
 * @return {Promise<{data: import('http').Server, err: Error}>}
 */
export function serverGenerator(port, { onRequest, onError }) {
  const serverPromise = new Promise((resolve, reject) => {
    try {
      const app = express();
      app.use(express.static(path.join(rootDir, 'public')));
      app.use(favicon(path.join(rootDir, 'public', 'favicon.ico')));
      app.use(bodyParser.json());
      app.use(bodyParser.urlencoded({ extended: true }));
      app.all('/openai/*', async (req, res) => {
        onRequest?.(req);
        try {
          const { method, params, headers, body, query } = req;
          const url = params['0'];
          const proxyURL = `https://api.openai.com/${url}`;
          const response = await request({
            url: proxyURL,
            method,
            headers,
            data: body,
            params: query,
            responseType: 'stream',
          });
          const stream = response.data;
          res.status(response.status);
          res.set(response.headers);
          stream.pipe(res);
        } catch (error) {
          // console.log(chalk.bgRed('\n\n服务器错误\n'));
          // console.error(error);
          // console.log('\n');
          onError?.(error);
          res.setHeader('Content-Type', 'text/html');
          if (error.response) {
            const { status, statusText, data } = error.response;
            if (isJSON(data)) {
              res.setHeader('Content-Type', 'application/json');
              res.status(status).send(data);
              return;
            }
            res.status(status).send(`Internal Server Error: ${statusText}(${status})`);
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
      const cmd = spawn(command, {
        shell: process.platform === 'win32',
        stdio: 'inherit',
        detached: false,
        windowsHide: true,
      });
      console.log(''); // 空一行
      cmd.on('exit', () => {
        resolve();
      });
      cmd.on('error', (err) => {
        reject(err);
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
  const answer = await askQuestion(` -- ${chalk.red('是否执行？')} (Y/N/E)：`);
  const v = answer.trim().toLowerCase();
  if (v === 'y') {
    const { err } = await commandGenerator(command);
    if (err) {
      console.log(`${chalk.bgRed('\n命令执行失败')} => ${err.message}\n`);
      return;
    }
    console.log(chalk.bgGreen('\n命令执行完毕\n'));
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
      rl.write(command);
    }, 0);
    const newCommand = await askQuestion(`\n -- ${chalk.blue('编辑命令')}：`);
    const { err } = await commandGenerator(newCommand);
    if (err) {
      console.log(`${chalk.bgRed('\n命令执行失败')} => ${err.message}\n`);
      return;
    }
    console.log(chalk.bgGreen('\n命令执行完毕\n'));
    return;
  }

  console.log(chalk.bgRed('\n命令未执行：非法字符\n'));
}

/**
 * @description 控制台对话函数
 * @return {*}
 */
async function chat() {
  const answer = await askQuestion(`${prefix} 用户：`);

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
        rl.close();
      });
      return;
    }
    console.log(chalk.bgRed('\n ChatGPT 退出会话 \n'));
    rl.close();
    return;
  }

  if (cleanKeywords.includes(answer)) {
    // 设置初始状态
    chatLog = [];
    cliLog = [cliDefinition, cliUserDefinition];
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
    const inputPath = await askQuestion(chalk.greenBright('\n请输入读取文件路径(*.json)：'));
    if (fs.existsSync(inputPath) && isJSONFile(inputPath)) {
      // 读取会话历史记录文件
      const json = await fsPromise.readFile(inputPath, { encoding: 'utf-8' });
      const readLog = JSON.parse(json);
      const { role, content } = cliDefinition;
      const isCliMode = readLog.filter((l) => l.content === content && l.role === role).length > 0;
      // 判断会话mode
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
      console.log(chalk.bgRed('\n ChatGPT 读取的文件不存在或格式不正确 \n'));
    }
    chat();
    return;
  }

  if (serveKeywords.includes(answer)) {
    if (!server) {
      const inputPort = (await askQuestion(chalk.greenBright('\n请输入服务端口号(3000)：'))) || 3000;
      const res = await serverGenerator(inputPort, {
        onRequest(req) {
          console.log(chalk.bgYellow('\n\n接口服务日志\n'));
          console.log(
            `${chalk.gray(getDateTime())}: ${chalk.bgGreen(req.method)} ${req.url} ${JSON.stringify(
              req.body,
            )}\n`,
          );
          chat();
        },
        onError(error) {
          console.log(chalk.bgRed('\n\n服务器错误\n'));
          console.error(error);
          console.log('\n');
          chat();
        },
      });
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
      ChatGPT 接口代理: http://localhost:${port}/openai/<openai接口地址>\n
      例如: http://localhost:${port}/openai/v1/chat/completions\n
      这样您可以无需验证openaiKey，直接使用ChatGPT\n`,
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

  // 越过重重阻拦，则开始请求 chatGPT 聊天
  spinner.start();

  const input = {
    role: ChatCompletionRequestMessageRoleEnum.User,
    content: answer,
  };

  // 接口入参
  let messages = [];
  if (mode === 'cli mode') {
    cliLog.push(input);
    messages = cliLog;
  }
  if (mode === 'chat mode') {
    chatLog.push(input);
    messages = chatLog;
  }

  const { data: stream, err: apiErr } = await chatCompletionGenerator(mode, messages, true);

  spinner.stop();

  if (apiErr) {
    console.log(`\n${chalk.bgRed('ChatGPT 生成对话失败')} => ${apiErr.type || 'Error'}: ${apiErr.message}\n`);
    chat();
    return;
  }

  // 接口出参
  askQuestion(chalk.yellowBright('\n[ChatGPT] 小助手：'));
  rl.preventHistory = true; // 阻止控制台记录历史数据
  const { data, err } = await streamPromise(stream, (m) => {
    // 打字机效果
    // 打字机的输入不计入控制台输入历史记录
    rl.write(m);
  });
  rl.preventHistory = false; // 恢复控制台记录历史数据

  if (err) {
    console.log(`\n${chalk.bgRed('ChatGPT 对话解析失败')} => ${err.message}\n`);
    chat();
    return;
  }

  if (data) {
    const { role, content } = data;
    if (mode === 'chat mode') {
      const output = { role, content };
      chatLog.push(output);
    }
    if (mode === 'cli mode') {
      // 如果答案里不止有命令行，还有其他内容，全部抛弃，只需要提取命令行结果以纠正gpt的回答，让结果更加确定。
      const command = extractCommandLine(content) || 'UNKNOWN';
      const output = { role, content: command };
      cliLog.push(output);
      // 执行命令行
      if (command !== 'UNKNOWN') {
        await execCommand(command.replace('>', ''));
      }
    }
  }

  chat();
}

console.log(
  `\n🤖 你好，我是 ${chalk.bgRed(` ChatGPT terminal v${packageInfo.version} `)}，输入 ${chalk.green(
    'help',
  )} 查看帮助，马上开启聊天吧！⚡\n`,
);

// 执行控制台对话
chat();
