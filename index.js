import ora from 'ora';
import chalk from 'chalk';
import path from 'node:path';
import express from 'express';
import favicon from 'serve-favicon';
import bodyParser from 'body-parser';
import fs, { promises as fsPromise } from 'node:fs';
import { promises as readlinePromise } from 'node:readline';
import { Configuration, OpenAIApi, ChatCompletionRequestMessageRoleEnum } from 'openai';
import { getSystemDownloadFolderPath, getAddress, dotenvConfig, isJSON, isObject } from './utils/index.js';
import request from './utils/request.js';

// 项目根目录
const root = path.resolve(path.dirname(''));

// 加载环境变量
const dotenvFiles = ['.env.local', '.env'];

dotenvConfig(dotenvFiles);

// 对话关键词
const exitKeywords = ['退出', '退下', 'exit', 'quit', 'bye'];

const saveKeywords = ['保存会话', '保存', 'save'];

const cleanKeywords = ['清空会话', '清空', 'clean'];

const readKeywords = ['读取会话', '读取', 'read'];

const serveKeywords = ['启动服务', '服务', 'serve'];

const stopKeywords = ['关闭服务', '终止', 'stop'];

const commandKeywords = ['指令', '指令大全', 'help'];

const commandsOutput = `\n
______________________________________________________________\n
${chalk.green('特殊指令(actions)：')}\n
${chalk.green('1.')} ${exitKeywords.join(chalk.green(' | '))} ${chalk.green(': 退出对话')}\n
${chalk.green('2.')} ${saveKeywords.join(chalk.green(' | '))} ${chalk.green(': 保存对话')}\n
${chalk.green('3.')} ${cleanKeywords.join(chalk.green(' | '))} ${chalk.green(': 清空对话')}\n
${chalk.green('4.')} ${readKeywords.join(chalk.green(' | '))} ${chalk.green(': 读取对话')}\n
${chalk.green('5.')} ${serveKeywords.join(chalk.green(' | '))} ${chalk.green(': 启动服务')}\n
${chalk.green('6.')} ${stopKeywords.join(chalk.green(' | '))} ${chalk.green(': 关闭服务')}\n
${chalk.green('7.')} ${commandKeywords.join(chalk.green(' | '))}${chalk.green(' : 查看指令大全')}\n
${chalk.green('8.')} \\img ${chalk.green('<')}图片描述${chalk.green('>')} ${chalk.green(': 生成图片')}\n
______________________________________________________________\n
\n`;

// 对话历史记录
let chatLog = [];

// 接口服务
let server = null;

// 控制台输入
const rlp = readlinePromise.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const configuration = new Configuration({
  organization: process.env.ORGANIZATION_ID,
  apiKey: process.env.OPENAI_API_KEY,
});

const spinner = ora('loading...');

// Openai API
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
 * @param {any[]} messages
 * @return {Promise<{data: any[], err: Error}>}
 */
function chatCompletionGenerator(messages) {
  return openai
    .createChatCompletion({
      model: 'gpt-3.5-turbo-0301',
      messages,
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
 * @return {Promise<import('http').Server>}
 */
export function serverGenerator(port) {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.static(path.join(root, 'public')));
    app.use(favicon(path.join(root, 'public', 'favicon.ico')));
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
  });
}

/**
 * @description 控制台对话函数
 * @return {*}
 */
async function chat() {
  const answer = await rlp.question(chalk.greenBright('请输入对话内容：'));

  if (exitKeywords.includes(answer)) {
    if (server) {
      server.close((err) => {
        if (err) process.exit(1);
        console.log(chalk.bgRed('\n ChatGPT 退出对话 \n'));
        server = null;
        rlp.close();
      });
      return;
    }
    console.log(chalk.bgRed('\n ChatGPT 退出对话 \n'));
    rlp.close();
    return;
  }

  if (cleanKeywords.includes(answer)) {
    chatLog.length = 0;
    console.clear();
    console.log(chalk.bgGreen('\n ChatGPT 已经清空对话历史 \n'));
    chat();
    return;
  }

  if (saveKeywords.includes(answer)) {
    const chatLogString = JSON.stringify(chatLog);
    const downloadDir = getSystemDownloadFolderPath();
    const filePath = path.join(downloadDir, 'chat-log.json');
    await fsPromise.writeFile(filePath, chatLogString, { encoding: 'utf-8' });
    console.log(`${chalk.bgGreen('\n ChatGPT 已经保存对话历史：')} => ${filePath}\n`);
    chat();
    return;
  }

  if (readKeywords.includes(answer)) {
    const inputPath = await rlp.question(chalk.greenBright('\n请输入读取文件路径(*.json)：'));
    if (fs.existsSync(inputPath)) {
      const json = await fsPromise.readFile(inputPath, { encoding: 'utf-8' });
      const readChatLog = JSON.parse(json);
      chatLog = chatLog.concat(readChatLog);
      console.log(chalk.bgGreen('\n ChatGPT 已经读取对话历史 \n'));
    } else {
      console.log(chalk.bgRed('\n ChatGPT 读取文件不存在 \n'));
    }
    chat();
    return;
  }

  if (serveKeywords.includes(answer)) {
    if (!server) {
      const inputPort = (await rlp.question(chalk.greenBright('\n请输入服务端口号(3000)：'))) || 3000;
      server = await serverGenerator(inputPort);
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

  if (commandKeywords.includes(answer)) {
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

  chatLog.push(input);

  const { data, err } = await chatCompletionGenerator(chatLog);

  spinner.stop();

  if (data && Array.isArray(data)) {
    data.forEach((choice) => {
      const { role, content } = choice.message;
      console.log(`${chalk.yellowBright(`\n ChatGPT ${role}: `) + content}\n`);
      const output = {
        role,
        content,
      };
      chatLog.push(output);
    });
  } else {
    console.log(`\n${chalk.bgRed('ChatGPT 生成对话失败')} => ${err.type || 'Error'}: ${err.message}\n`);
  }

  chat();
}

console.log(
  `${chalk.bgBlue('ChatGPT:')} 你好，我是 ChatGPT！你可以和我聊天。${commandsOutput}⚡ 开始聊天吧！\n`,
);

// 执行控制台对话
chat();
