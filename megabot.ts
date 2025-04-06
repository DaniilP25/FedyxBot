import { Bot, session, Context, InlineKeyboard, SessionFlavor } from "grammy";
import {
  conversations,
  createConversation,
  type Conversation,
  type ConversationFlavor,
} from "@grammyjs/conversations";
import { Client, QueryResult, QueryResultRow } from "pg";
import { db_query } from "./db";

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
  const token = message.text;
  const authorID = ctx.from?.id;

  if (!authorID) {
    await ctx.reply("❌ Не удалось определить ID пользователя.");
    return;
  }

  try {
    if (await validateToken(token)) {
      await conversation.external(() =>
        db_query(
          `INSERT INTO apps(token, authorID, helloMessage, timeoutMessage, banMessage, unbanMessage, sendMessage, targetGroupID)
           VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
          [token, authorID, '', '', '', '', '', 0]
        )
      );  
      await ctx.reply("✅ Бот успешно создан!");
    }
    else {
      await ctx.reply("❌ Ошибка при создании бота. Введите корректный токен или попробуйте позже.");
    }
  } catch (error) {
    console.error("Ошибка при создании бота:", error);
    await ctx.reply("❌ Ошибка при создании бота. Введите корректный токен или попробуйте позже.");
  }

  return token;
}

async function validateToken(token: string) {
  try {
    const validateBot = new Bot(token);
    validateBot.start();
    validateBot.stop();
    return true;  
  }
  catch {
    return false;
  }
}

async function runBot(token: string) {

}

bot.start();