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
import open from 'open';
import { Configuration, OpenAIApi, ChatCompletionRequestMessageRoleEnum } from 'openai';
import request from './utils/request.js';
import functionsImplemention from './functions/implementation.js';
import { get_current_weather } from './functions/definition.js';
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
  exitKeywords,
  saveKeywords,
  cleanKeywords,
  readKeywords,
  serveKeywords,
  stopKeywords,
  helpKeywords,
  chatModeKeywords,
  cliModeKeywords,
  streamEnableKeywords,
  streamStopKeywords,
  commandsOutput,
  cliDefinition,
} from './utils/constant.js';

// 加载环境变量
if (!process.env.OPENAI_API_KEY) {
  const dotenvFiles = ['.env.local', '.env'];
  dotenvConfig(dotenvFiles);
}

const model = process.env.CHATGPT_MODEL || 'gpt-3.5-turbo-16k';

// 初始化模式
/** @type {'chat mode' | 'cli mode'} */
let mode = 'chat mode';

// 初始化流式输出
let streamOutput = true;

// 初始化模式提示前缀
let prefix = getPrefix(mode);

// 初始化对话模式历史记录
let chatLog = [];

// 初始化命令行模式历史记录
let cliLog = [cliDefinition];

// 初始化函数定义
const functionsDefinition = [get_current_weather];

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
  // @ts-ignore
  if (rl.preventHistory) history.shift();
});

// 初始化控制台loading
const spinner = ora({
  text: 'loading...',
  discardStdin: false,
});

// 初始化 Openai
const { OPENAI_API_KEY, ORGANIZATION_ID, CHATGPT_REGISTRY } = process.env;
const config = {};
if (OPENAI_API_KEY) config.apiKey = OPENAI_API_KEY;
if (ORGANIZATION_ID) config.organization = ORGANIZATION_ID;
if (CHATGPT_REGISTRY) {
  config.basePath = CHATGPT_REGISTRY;
  streamOutput = false;
  console.log(`\n${chalk.green('ChatGPT API Registry')}: ${CHATGPT_REGISTRY}`);
  console.log(
    `\n${chalk.bgYellow(
      ' 温馨提示 ',
    )}：检测到您在使用非官方源，这可能导致流式输出不稳定，已自动关闭流式输出，您依然可以通过 ${streamEnableKeywords
      .map((t) => chalk.green(t))
      .join(' | ')} 命令开启流式输出。\n`,
  );
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
 * @param {string} imgDesc
 * @returns {Promise<{data?: any[], err?: any}>}
 */
function imageGenerator(imgDesc) {
  return openai
    .createImage({
      prompt: imgDesc,
      response_format: 'url',
      n: 1,
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
 * @returns {Promise<{data?: any, err?: any}>}
 */
function chatCompletionGenerator(_mode, messages, stream = false) {
  let function_call = 'auto'; // 智能决定是否调用函数
  let functions = functionsDefinition; // 函数描述定义
  let temperature = 1; // 0-2 之间的浮点数，表示模型生成文本的创造性程度 0最保守 2最大创造性
  if (_mode === 'cli mode') {
    // 命令行模式下，创造性程度最低，需要严格按照system限定输出
    temperature = 0;
    // 命令行模式下，禁止函数调用
    // @ts-ignore
    function_call = undefined;
    // @ts-ignore
    functions = undefined;
  }
  return openai
    .createChatCompletion(
      {
        model,
        messages,
        functions,
        temperature,
        function_call,
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
 * @param {(text: string) => void} [onOutput] 输出回调
 */
function streamPromise(stream, onOutput) {
  const promise = new Promise((resolve, reject) => {
    let _role;
    let _content = '';
    const _function_call = { name: '', arguments: '' };
    try {
      stream.on('data', (chunk) => {
        const payloads = chunk.toString().split('\n\n');
        payloads.forEach((payload) => {
          if (payload.includes('[DONE]')) return;
          if (payload.startsWith('data:')) {
            let data;
            try {
              data = JSON.parse(payload.replace('data: ', ''));
            } catch (err) {
              data = null;
            }
            if (!data) return;
            const { role, content, function_call } = data.choices?.[0]?.delta ?? {};
            if (role) _role = role;
            if (function_call) {
              if (function_call.name) _function_call.name = function_call.name;
              if (function_call.arguments) _function_call.arguments += function_call.arguments;
            }
            if (content) {
              _content += content;
              if (onOutput) onOutput(content);
            }
          }
        });
      });
      stream.on('end', () => {
        if (onOutput && _content.trim() !== '') onOutput('[END]');
        const message = { role: _role, content: _content };
        if (_function_call.name) message.function_call = _function_call;
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
          // 服务器错误
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
        resolve('exit');
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
 */
export async function execCommand(command) {
  const answer = await askQuestion(` -- ${chalk.red('是否执行？')} (Y/N/E)：`);
  const v = answer.trim().toLowerCase();
  if (v === 'y') {
    // @ts-ignore
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
    // @ts-ignore
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
 * @export
 * @param {boolean} [mute=false] 是否静音，静音模式下不会询问用户，直接生成回答
 * @return {Promise<void>}
 */
export async function chat(mute = false) {
  let input; // 用户输入消息体

  if (!mute) {
    const answer = await askQuestion(`${prefix} 用户：`);

    if (streamEnableKeywords.includes(answer)) {
      if (streamOutput) {
        console.log(chalk.bgRed('\n ChatGPT 已经处于流式输出模式 \n'));
        chat();
        return;
      }
      console.log(chalk.bgGreen('\n ChatGPT 已切换到流式输出模式 \n'));
      streamOutput = true;
      chat();
      return;
    }

    if (streamStopKeywords.includes(answer)) {
      if (!streamOutput) {
        console.log(chalk.bgRed('\n ChatGPT 已经处于非流式输出模式 \n'));
        chat();
        return;
      }
      console.log(chalk.bgGreen('\n ChatGPT 已切换到非流式输出模式 \n'));
      streamOutput = false;
      chat();
      return;
    }

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
      cliLog = [cliDefinition];
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
        const inputPort = (await askQuestion(chalk.greenBright('\n请输入服务端口号(3000)：'))) || '3000';
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
        if ('err' in res && res.err) {
          console.log(chalk.bgRed('\n ChatGPT 代理服务启动失败 \n'));
          console.log(`${res.err.message}\n`);
          chat();
          return;
        }
        // @ts-ignore
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
      if (Array.isArray(data) && data.length > 0) {
        console.log(`\n${chalk.bgGreen('ChatGPT 图片生成成功')}\n`);
        data.forEach((img) => {
          const { url } = img;
          console.log(`${chalk.bgYellow(' 图片地址 ')}：${url}\n`);
          // 使用浏览器打开图片
          open(url);
        });
      } else {
        console.log(`\n${chalk.bgRed('ChatGPT 生成图片失败')} => ${err.type || 'Error'}: ${err.message}\n`);
      }
      chat();
      return;
    }

    input = {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: answer,
    };
  }

  // ChatGPT Request messages: 上下文消息体
  let messages = [];
  if (mode === 'cli mode') {
    // @ts-ignore
    if (input) cliLog.push(input);
    messages = cliLog;
  }
  if (mode === 'chat mode') {
    if (input) chatLog.push(input);
    messages = chatLog;
  }

  // ChatGPT Response message: 生成的回答
  let message;

  // ChatGPT fetching: 开始请求
  spinner.start();
  if (streamOutput) {
    // 流式输出
    const { data: stream, err } = await chatCompletionGenerator(mode, messages, true);
    spinner.stop();
    if (err) {
      console.log(`\n${chalk.bgRed('ChatGPT 生成对话失败')} => ${err.type || 'Error'}: ${err.message}\n`);
      chat();
      return;
    }
    // 处理流式输出
    askQuestion(`\n${chalk.yellowBright('[ChatGPT] 小助手：')}`);
    // @ts-ignore
    rl.preventHistory = true; // 阻止控制台记录历史数据
    // @ts-ignore
    const { data, err: parseErr } = await streamPromise(stream, (m) => {
      // 打印消息不计入终端历史数据
      if (m === '[END]') {
        rl.write('\n\n');
        return;
      }
      rl.write(m);
    });
    // @ts-ignore
    rl.preventHistory = false; // 恢复控制台记录历史数据
    if (parseErr) {
      console.log(`\n${chalk.bgRed('ChatGPT 对话解析失败')} => ${parseErr.message}\n`);
      chat();
      return;
    }
    message = data;
  } else {
    // 非流式输出
    const { data, err } = await chatCompletionGenerator(mode, messages);
    spinner.stop();
    if (err) {
      console.log(`\n${chalk.bgRed('ChatGPT 生成对话失败')} => ${err.type || 'Error'}: ${err.message}\n`);
      chat();
      return;
    }
    message = data[0].message;
    if (message.content) {
      console.log(`\n${chalk.yellowBright('[ChatGPT] 小助手：')}${message.content}\n`);
    }
  }

  // 请求结束，拿到结果，开始处理结果和后续操作
  if (message) {
    const { role, content, function_call } = message;
    if (mode === 'chat mode') {
      // 函数对话
      if (function_call) {
        // 清除当前行
        readline.clearLine(process.stdout, 0);
        // 将光标移动到行首
        readline.cursorTo(process.stdout, 0);
        const functionCall = {
          role,
          content: null,
          function_call,
        };
        chatLog.push(functionCall);
        // 开始执行函数：获取返回值，然后将返回值作为消息添加到上下文重新生成对话
        spinner.start();
        // @ts-ignore
        const { data: result, err: funcErr } = await functionsImplemention[function_call.name](
          JSON.parse(function_call.arguments),
        )
          .then((data) => ({ data }))
          .catch((err) => ({ err }));
        spinner.stop();
        if (funcErr) {
          rl.write('\n'); // 终止question
          console.log(`\n${chalk.bgRed('ChatGPT 函数执行失败')} => ${funcErr.message}\n`);
          chat();
          return;
        }
        const functionComplete = {
          role: ChatCompletionRequestMessageRoleEnum.Function,
          name: function_call.name,
          content: JSON.stringify(result),
        };
        chatLog.push(functionComplete);
        chat(true);
        return;
      }
      // 普通对话
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

  // 递归调用: 继续对话
  chat();
}
