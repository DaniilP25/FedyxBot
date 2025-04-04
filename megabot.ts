import { Bot, InlineKeyboard, InputMediaBuilder } from "grammy";

const bot = new Bot("7719267045:AAHekSK0ozNXfoIHs9xskiSJ3x5GUvDrkho"); // token

const startMenu = new InlineKeyboard()                    // кнопки бан разбан удалить
  .text("🤖 Ваши предложки", "mybot")
  .text("🆘 Поддержка", "support")
  .text("💸 Пожертвование", "donate");

bot.command("start", async (ctx) => {
    await ctx.reply(`<b>Главное меню</b>\n\n<i>Ваши предложки</i> - создание и управление предложками\n<i>Поддержка</i> - тех.поддержка бота, писать если бот выключился или есть проблемы с оплатой\n<i>Пожертвование</i> - денежное пожертвование команде бота, с вознаграждением в виде некоторых преимуществ в функционале бота`,
                    {reply_markup: startMenu, parse_mode: "HTML"}); // start message
});

// здесь должен быть постгрес

bot.start();