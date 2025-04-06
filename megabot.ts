import { Bot, session, Context, InlineKeyboard, SessionFlavor } from "grammy";
import {
  conversations,
  createConversation,
  type Conversation,
  type ConversationFlavor,
} from "@grammyjs/conversations";
import { Client, QueryResult, QueryResultRow } from "pg";
import { db_query } from "./db";
import { runBot } from "./bot";

// Типизация
interface SessionData {}
type MyContext = Context & ConversationFlavor<Context> & SessionFlavor<SessionData>;
type MyConversationContext = Context;
type MyConversation = Conversation<MyContext, MyConversationContext>;

const bot = new Bot<MyContext>("7719267045:AAE6qwgfcbpkVNmVnd1JB_zSrevff-V-s_0");

// Middleware
bot.use(conversations());
bot.use(createConversation(getToken));

// Главное меню
const startMenu = new InlineKeyboard()
  .text("🤖 Мои боты", "mybots")
  .text("🆘 Поддержка", "support")
  .text("💸 Подписка", "sub")
  .text("➕ Новый бот", "newbot");

// Потужий запуск бота
(async () => {
  const tokens_row = await db_query('SELECT token FROM apps;');
  let token, isValid;

  for (let i = 0; i < tokens_row.length; i++) {
    try {
      token = tokens_row[i]['token'];
      isValid = await validateToken(token);
      if (isValid) {
        runBot(token);      
      }  
    }
    catch {}
  }
})();

// Обработка /start
bot.command("start", async (ctx) => {
  const db = {
    async checkUserExists(id: number): Promise<boolean> {
      const result: QueryResultRow = await db_query(
        `SELECT EXISTS(SELECT 1 FROM customers WHERE id = $1)`,
        [id]
      );
      return true;
    },

    async createUser(id: number): Promise<void> {
      await db_query(
        `INSERT INTO customers(id, premium, tokens) VALUES($1, TO_TIMESTAMP(0) AT TIME ZONE 'UTC', $2)`,
        [id, []]
      );
    },
  };

  const userId = ctx.from?.id;
  if (!userId) return;

  if (!(await db.checkUserExists(userId))) {
    await db.createUser(userId);
  }

  await ctx.reply(
    `<b>Главное меню</b>\n\n<i>Ваши предложки</i> - создание и управление предложками\n<i>Поддержка</i> - тех.поддержка бота, писать если бот выключился или есть проблемы с оплатой\n<i>Пожертвование</i> - денежное пожертвование команде бота, с вознаграждением в виде некоторых преимуществ в функционале бота`,
    { reply_markup: startMenu, parse_mode: "HTML" }
  );
});

// Callback кнопки
bot.callbackQuery("mybots", async (ctx) => {
  await ctx.reply(`Список ботов:\n...`);
});

bot.callbackQuery("support", async (ctx) => {
  await ctx.reply(`Есть вопросы? Напиши нам в <a href="https://t.me/tgts_support">поддержку</a>.`, {
    parse_mode: "HTML",
  });
});

bot.callbackQuery("sub", async (ctx) => {
  await ctx.reply("Плюсы подписки и все такое, потом нормально оформлю.");
});

bot.callbackQuery("newbot", async (ctx) => {
  await ctx.conversation.enter("getToken");
});

// Разговор
async function getToken(conversation: MyConversation, ctx: MyConversationContext) {
  await ctx.reply(
    `Чтобы создать бота, вам нужно получить токен у <b>@BotFather</b>.\nОтправьте его в этот чат:`,
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
    isValid = await validateToken(token);
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
        `INSERT INTO apps(token, authorID, helloMessage, timeoutMessage, banMessage, unbanMessage, sendMessage, targetGroupID)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
        [token, authorID, '', '', '', '', '', 0]
      )
    );
    await ctx.reply("✅ Бот успешно создан!");
    runBot(token);
  } catch (error) {
    console.error("Ошибка при добавлении в базу данных:", error);
    await ctx.reply("❌ Токен недействителен. Пожалуйста, введите корректный токен от @BotFather.");
  }

  return token;
}

// Функция для проверки токена
async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    return data.ok === true;
  } catch (err) {
    console.error("Ошибка в запросе к Telegram API:", err);
    return false;
  }
}

bot.start();