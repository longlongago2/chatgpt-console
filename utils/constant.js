import path from 'node:path';
import fs from 'node:fs';
import chalk from 'chalk';
import appRoot from 'app-root-path';
import { ChatCompletionRequestMessageRoleEnum } from 'openai';

// Path: utils\constant.js 常量配置

// 项目根目录
// 注意：
// process.cwd() 获取的是执行命令行的目录，而不是文件目录
// 如果安装命令行之后，路径获取的是当前执行命令行的目录，
// 因此不能使用 process.cwd()
export const rootDir = appRoot.path;

export const pkgJsonPath = path.join(rootDir, 'package.json');

export const packageInfo = fs.existsSync(pkgJsonPath)
  ? JSON.parse(fs.readFileSync(pkgJsonPath, { encoding: 'utf-8' }))
  : {};

// 对话关键词
export const exitKeywords = ['退出', '退下', 'exit', 'quit', 'bye'];

export const saveKeywords = ['保存会话', '保存', 'save'];

export const cleanKeywords = ['清空会话', '清空', 'clean'];

export const readKeywords = ['读取会话', '读取', 'read'];

export const serveKeywords = ['启动服务', '服务', 'serve'];

export const stopKeywords = ['关闭服务', '终止', 'stop'];

export const helpKeywords = ['指令', '指令大全', 'help'];

export const chatModeKeywords = ['对话模式', 'chat mode'];

export const cliModeKeywords = ['命令行模式', 'cli mode'];

// 指令罗列输出内容
export const commandsOutput = `\n
${chalk.green('------------------------------------------------------\n')}
${chalk.green('指令：')}\n
${chalk.green('1.')} ${exitKeywords.join(chalk.green(' | '))} ${chalk.green(': 退出对话')}\n
${chalk.green('2.')} ${saveKeywords.join(chalk.green(' | '))} ${chalk.green(': 保存对话')}\n
${chalk.green('3.')} ${cleanKeywords.join(chalk.green(' | '))} ${chalk.green(': 清空对话')}\n
${chalk.green('4.')} ${readKeywords.join(chalk.green(' | '))} ${chalk.green(': 读取对话')}\n
${chalk.green('5.')} ${serveKeywords.join(chalk.green(' | '))} ${chalk.green(': 启动服务')}\n
${chalk.green('6.')} ${stopKeywords.join(chalk.green(' | '))} ${chalk.green(': 关闭服务')}\n
${chalk.green('7.')} ${helpKeywords.join(chalk.green(' | '))}${chalk.green(' : 查看指令大全')}\n
${chalk.green('8.')} ${chatModeKeywords.join(chalk.green(' | '))}${chalk.green(' : 切换对话模式（默认）')}\n
${chalk.green('9.')} ${cliModeKeywords.join(chalk.green(' | '))}${chalk.green(' : 切换命令行模式')}\n
${chalk.green('10.')} \\img ${chalk.green('<')}图片描述${chalk.green('>')} ${chalk.green(': 生成图片')}\n
${chalk.green('------------------------------------------------------\n')}
\n`;

// 命令行模式下系统【指导聊天模型】
// 根据文档得知：
// 1.gpt-3.5-turbo-0301 并不总是高度关注系统消息，未来的模型将被训练为更加关注系统消息
// 2.一般来说，gpt-3.5-turbo-0301 对系统消息的关注度不高，因此重要的说明往往放在用户消息中比较好。
// 因此，现阶段【指导聊天模型】最好再用用户消息加强一遍
export const cliDefinition = {
  role: ChatCompletionRequestMessageRoleEnum.System,
  content: `You are a command line translation program. You can translate natural language instructions from human language into corresponding command line statements.
  
  1. If you can understand what i'm saying, output the command line code without any explanation, and you must add the ">" symbol at the beginning of the output. For example: ">tree".
  
  2. If you don't understand what i'm saying or are unsure how to convert my instructions into a computer command line, just output the 7 letters "UNKNOWN" without any other explanation or ">" symbol. For example: "UNKNOWN".
  
  3. If the translated result consists of more than one line of commands, you must use '&' or '&&' to combine them into a single line of command. For example: ">cd .. & cd ..".
  
  4. If the user asks the same question, it means that the user is not satisfied with the previous answer, please try to use new data to answer.
  `,
};

// 命令行模式下用户【指导聊天模型】
export const cliUserDefinition = {
  role: ChatCompletionRequestMessageRoleEnum.User,
  content: cliDefinition.content,
};
