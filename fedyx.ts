import { Bot, session, Context, InlineKeyboard, SessionFlavor, CallbackQueryContext, CommandContext } from "grammy";
import {
  conversations,
  createConversation,
  type Conversation,
  type ConversationFlavor,
} from "@grammyjs/conversations";
import { QueryResultRow } from "pg";
import { db_query } from "./db";
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { formatUnixTime, isPremium, runBot } from "./bot";

// Типизация
interface SessionData {}
type MyContext = Context & ConversationFlavor<Context> & SessionFlavor<SessionData>;
type MyConversationContext = Context;
type MyConversation = Conversation<MyContext, MyConversationContext>;

const fileContents = fs.readFileSync('./config.yaml', 'utf8');
const config = yaml.load(fileContents) as {[key: string]: any};

function sync_yaml(config: {[key: string]: any}) {
  const yamlString = yaml.dump(config);
  fs.writeFileSync('config.yaml', yamlString);
}

const bot = new Bot<MyContext>(config.fedyxToken);

// Middleware
bot.use(conversations());
bot.use(createConversation(getToken));

// Главное меню
const startMenu = new InlineKeyboard()
  .text("🤖 Мои боты", "mybots")
  .text("🆘 Поддержка", "support")
  .row()
  .text("💸 Подписка", "sub")
  .text("➕ Новый бот", "newbot");

const buyPremiumPls = new InlineKeyboard()
  .text("💸 Купить подписку", "sub");

// Потужий запуск бота
(async () => {
  const tokens_row = await db_query('SELECT token FROM apps;');
  let token, isValid;

  for (let i = 0; i < tokens_row.length; i++) {
    try {
      token = tokens_row[i]['token'];
      isValid = await validateToken(token, 0);
      if (isValid) {
        runBot(token);
      }
    }

    catch {}
  }
})();

export async function register(id: number) {
  const db = {
    async checkUserExists(id: number): Promise<boolean> {
      const result: QueryResultRow = await db_query(
        `SELECT EXISTS(SELECT 1 FROM customers WHERE id = $1)`,
        [id]
      );
      return result[0]["exists"];
    },

    async createUser(id: number): Promise<void> {
      await db_query(
        `INSERT INTO customers(id, premium, tokens) VALUES($1, TO_TIMESTAMP(0), $2)`,
        [id, []]
      );
    },
  };

  if (!(await db.checkUserExists(id))) {
    await db.createUser(id);
  }
}

async function start(ctx: CommandContext<MyContext>) {
  await register(ctx.from!.id);
  try {
    await ctx.editMessageText(
      `<b>Главное меню</b>\n\n<i>Ваши предложки</i> - создание и управление предложками\n<i>Поддержка</i> - тех.поддержка бота, писать если бот выключился или есть проблемы с оплатой\n<i>Пожертвование</i> - денежное пожертвование команде бота, с вознаграждением в виде некоторых преимуществ в функционале бота`,
      { reply_markup: startMenu, parse_mode: "HTML" }
    );
  }
  catch {
    await ctx.reply(
      `<b>Главное меню</b>\n\n<i>Ваши предложки</i> - создание и управление предложками\n<i>Поддержка</i> - тех.поддержка бота, писать если бот выключился или есть проблемы с оплатой\n<i>Пожертвование</i> - денежное пожертвование команде бота, с вознаграждением в виде некоторых преимуществ в функционале бота`,
      { reply_markup: startMenu, parse_mode: "HTML" }
    );
  }
}

// Обработка /start
bot.command("start", async (ctx) => {
  await start(ctx); 
});

async function mybots(ctx: CallbackQueryContext<MyContext>) {
  const tokens_row = await db_query('SELECT token FROM apps WHERE authorID = $1;', [ctx.from.id]);
  let token, isValid;
  let bots = ''; //не пишите сюда плз (потом уберем)

  let botButtons = new InlineKeyboard();

  for (let i = 0; i < tokens_row.length; i++) {
    try {
      token = tokens_row[i]['token'];
      isValid = await validateToken(token, 0);
      if (isValid) {
        const botCheck = new Bot(token); // Замените на ваш токен
        const botInfo = await botCheck.api.getMe();
        bots += `\n<a href="https://t.me/${botInfo.username}">${botInfo.first_name}</a>`;
        botButtons = botButtons.text(botInfo.first_name, `botButtons${token}`);
      }
    }
    catch {}
  }
  botButtons.row();
  botButtons.text("🔙 Назад", `back${0}`);

  await ctx.editMessageText(`🤖Список ботов:\n${bots}`, {parse_mode: "HTML", reply_markup: botButtons});
}

// Callback кнопки
bot.callbackQuery("mybots", async (ctx) => {
  await mybots(ctx);
});

bot.callbackQuery(/^botButtons(.+)/, async (ctx) => {
  const buttonId = ctx.callbackQuery.data; // Получаем полный идентификатор
  const token = buttonId.replace("botButtons", "");
  let premium_row = await isPremium(ctx.from.id);  
  // let date = new Date(premium_row[1] * 1000);
  // const time = premium_row[1];
  const time_row = await db_query("SELECT EXTRACT(EPOCH FROM weektimestamp AT TIME ZONE 'UTC') AS unix_timestamp FROM APPS WHERE token = $1", [token]);
  const time = parseInt(time_row[0]['unix_timestamp']);
  const updLimitDate = await formatUnixTime(time);
  const botButton = new Bot(token);
  const botInfo = await botButton.api.getMe();
  let botButtons = new InlineKeyboard();
  // botButtons = botButtons; //.text()
  let weekLimitText; //, subText;
  // const balance_row = db_query('SELECT balance FROM CUSTOMERS WHERE id = $1', [ctx.from.id]);

  if (premium_row[0]) {
    weekLimitText = "Лимит сообщений в неделю: без ограничений";

    // subText = `Premium (до ${date})`;
  }
  else {
    const weekLimit_row = await db_query('SELECT weekLimit FROM apps WHERE token = $1', [token]);
    let weekLimit = weekLimit_row[0]['weeklimit'];
    weekLimitText = `Лимит сообщений в неделю: ${weekLimit}/1000 (обновится ${updLimitDate})`;
    // subText = "отсутствует";
  }
  
  botButtons.text("🔙 Назад", `back${1}`);


  const text = `Управление <a href="https://t.me/${botInfo.username}">${botInfo.first_name}</a>
${weekLimitText}`;
  await ctx.editMessageText(text, {parse_mode: "HTML", reply_markup: botButtons});
}); // Подписка: ${subText} // Баланс: ${balance_row[0]['balance']}₽

bot.callbackQuery(/^back(.+)/, async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
  const currentPage = parseInt(callbackData.replace("back", ""), 10);
  // Получаем текущую страницу из callback_data
  
  if (currentPage == 0) {
    await ctx.editMessageText(`<b>Главное меню</b>\n\n<i>Ваши предложки</i> - создание и управление предложками\n<i>Поддержка</i> - тех.поддержка бота, писать если бот выключился или есть проблемы с оплатой\n<i>Пожертвование</i> - денежное пожертвование команде бота, с вознаграждением в виде некоторых преимуществ в функционале бота`,
      {
      parse_mode: "HTML",
      reply_markup: startMenu
    });
  }
  else if (currentPage == 1) {
    await mybots(ctx);
  }

});

// Пример генератора клавиатуры с пагинацией
// function generateKeyboard(page: number): InlineKeyboard {
//   if (page === 0) {
//     return startMenu;    
//   }
//   else {
//     return new InlineKeyboard();
//   }
// }

bot.callbackQuery("support", async (ctx) => {
  await ctx.reply(`По вопросам пишите в <a href="https://t.me/fedyx_support">поддержку</a>`, {parse_mode: "HTML"});
});

bot.callbackQuery("sub", async (ctx) => {
  await ctx.reply("Приобретая подписку ввы получаете:\n 1. Что-то,\n 2. Что-то,\n 3. Что-то"); // из notes.md красиво переписать
});

bot.callbackQuery("newbot", async (ctx) => {
  const rawBotCount = await db_query('SELECT COUNT(token) AS count FROM APPS WHERE authorid = $1', [ctx.from.id]);
  const botCount = parseInt(rawBotCount[0]["count"]);
  const premium = await isPremium(ctx.from.id);

  if (premium[0] === true) {
    if (botCount >= 3) {
      await ctx.reply("Достигнут лимит ботов.");
    }
    else {
      await ctx.conversation.enter("getToken");
    }
  }
  else {
    if (botCount >= 1) {
      await ctx.reply("Достигнут лимит ботов! Приобретите подписку, чтобы увеличить лимит.",
        {reply_markup: buyPremiumPls}
      );
    }
    else {
      await ctx.conversation.enter("getToken");
    }
  }
});

// bot noviy
async function getToken(conversation: MyConversation, ctx: MyConversationContext) {
  await ctx.reply(
    `Чтобы создать бота🤖, вам нужно получить токен у <b>@BotFather</b>.\nОтправьте его следующим сообщением в чат:`,
    { parse_mode: "HTML" }
  );

  const { message } = await conversation.waitFor("message:text");
  const token = message.text.trim();
  const authorID = ctx.from?.id;

  if (!authorID) {
    await ctx.reply("❌ Не удалось определить ID пользователя.");
    return;
  }

  let isValid = false;
  try {
    isValid = await validateToken(token, 0);
  } catch (error) {
    console.error("Ошибка в validateToken:", error);
    await ctx.reply("❌ Произошла ошибка при проверке токена. Попробуйте снова.");
    return;
  }

  if (!isValid) {
    await ctx.reply("❌ Токен недействителен. Пожалуйста, введите корректный токен от @BotFather.");
    return;
  }

  try {
    await conversation.external(() =>
      db_query(
        `INSERT INTO apps(token, authorID, weekTimestamp, helloMessage, timeoutMessage, banMessage, unbanMessage, sendMessage, targetGroupID)
         VALUES($1, $2, (NOW() + INTERVAL '7 days') AT TIME ZONE 'UTC', $3, $4, $5, $6, $7, $8)`,
        [token, authorID, '', '', '', '', '', 0]
      )
    );
    await ctx.reply("✅ Бот успешно создан!");
    validateToken(token, 0);
    runBot(token);
  } catch (error) {
    console.error("Ошибка при добавлении в базу данных:", error);
    await ctx.reply("❌ Токен недействителен. Пожалуйста, введите корректный токен от @BotFather.");
  }

  return token;
}

// Функция для проверки токена
async function validateToken(token: string, count: number): Promise<boolean> {
  try {
    if (count < 4) {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await res.json();
      return data.ok === true;
    }
    else {
      return false;
    }
  } catch (err) {
    console.error("Ошибка в запросе к Telegram API:", err);
    validateToken(token, count + 1);
    return false;
  }
}

bot.start();