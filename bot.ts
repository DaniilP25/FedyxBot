import { Bot, InlineKeyboard, InputMediaBuilder } from "grammy";

import * as fs from 'fs';
import * as yaml from 'js-yaml';

// ТУТ НУЖНО: ПЕРЕПИСАТЬ ДАННЫЕ ИЗ CONFIG.YAML В БД
// понял принял, не против если меня будет консультировать кириеш?
// я только за, чтобы он был с нами, но надо будет ему все объяснить, что и где, и зачем
// по крайней мере надо пофиксить здесь фигню, чтобы бот не спамил ошибками и работал корректно,
// а основная задача после этой - в мегаботе реализовать все

// я отойду дела сделаю

let timeout_users: number[] = [];

const fileContents = fs.readFileSync('./config.yaml', 'utf8');
const config = yaml.load(fileContents) as {[key: string]: any};
const bot = new Bot(config.token);

function sync_yaml(config: {[key: string]: any}) {
  const yamlString = yaml.dump(config);
  fs.writeFileSync('config.yaml', yamlString);
}

function removeTimeout(id: number): void {
  delete timeout_users[timeout_users.indexOf(id)];
}

const msgButtons = new InlineKeyboard()                    // кнопки бан разбан удалить
  .text("⛔", "ban")
  .text("✅", "unban")
  .text("🗑️", "delete");



bot.command("start", async (ctx) => {                      // /start
    await ctx.reply(config.helloMessage);
});

bot.on('message', async (ctx) => {
    const chatType = ctx.chat.type;

    if (chatType === 'private') {                                        // поведение бота в лс, перенаправление текста и фото в группу, проверка на бан

        if (config.banList.includes(ctx.from.id)) { // проверка на бан
          ctx.reply(config.bannedMessage);
          return;
        }

        if (timeout_users.includes(ctx.from.id)) { // проверка на обоюнду
          ctx.reply(config.timeoutMessage);
          return;
        }

        const message = ctx.message;
        const media: any[] = [];

        // Обрабатываем фото

        if (message.photo && Array.isArray(message.photo)) {
          const firstPhoto = message.photo[0]; // Берем элемент с индексом 0
          if (firstPhoto) {
              media.push(InputMediaBuilder.photo(firstPhoto.file_id));
          }
        }

        // Обрабатываем видео
        if (message.video) {media.push(InputMediaBuilder.video(message.video.file_id))}

        if (message.video && Array.isArray(message.video)) {
            message.video.forEach(video => {
                media.push(InputMediaBuilder.video(video.file_id));
            });
        }

        // Обрабатываем аудио
        if (message.audio) {media.push(InputMediaBuilder.audio(message.audio.file_id))}

        if (message.audio && Array.isArray(message.audio)) {

            message.audio.forEach(audio => {
              media.push(InputMediaBuilder.audio(audio.file_id));
            });
        }

        // Обрабатываем документы
        if (message.document) {media.push(InputMediaBuilder.document(message.document.file_id))}

        if (message.document && Array.isArray(message.document)) {

            message.document.forEach(document => {
              media.push(InputMediaBuilder.document(document.file_id));
            });

        }

        if (message.sticker) {
          // Стикеры передаем как документы
          media.push(InputMediaBuilder.document(message.sticker.file_id));
          
          // Альтернативно можно использовать метод для стикеров
          // media.push(InputMediaBuilder.sticker(message.sticker.file_id));
        }

        if (media.length > 0) {

          await ctx.api.sendMediaGroup(config.targetGroupId, media); // отправка вложений

          if (message.caption) {

            await bot.api.sendMessage(config.targetGroupId,          // отправка текста
`<b>Новое сообщение:</b> <code>${message.caption}</code>
👤 <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>
<tg-spoiler>${ctx.from.id}</tg-spoiler>`,
            {parse_mode: "HTML", reply_markup: msgButtons})

          }
          else {

            await bot.api.sendMessage(config.targetGroupId,          // отправка текста
`<b>Новое сообщение! Вложения выше</b>
👤 <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>
<tg-spoiler>${ctx.from.id}</tg-spoiler>`,
            {parse_mode: "HTML", reply_markup: msgButtons})
          }

        } else {

          await bot.api.sendMessage(config.targetGroupId,            // отправка текста
`<b>Новое сообщение:</b> <code>${message.text}</code>
👤 <a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>
<tg-spoiler>${ctx.from.id}</tg-spoiler>`,
          {parse_mode: "HTML", reply_markup: msgButtons})
        }

        timeout_users.push(ctx.from.id);
        setInterval(() => removeTimeout(ctx.from.id), 3000);
        await ctx.react(config.successEmoji);                        // реакция

  } else if (chatType === 'group' || chatType === 'supergroup') {    // отправка сообщений от группы в личку, выход из лишних групп

        if (ctx.chat.id == config.targetGroupId) {
           try {
              if (ctx.msg.reply_to_message == undefined) {
                return;
              }

              if (ctx.msg.reply_to_message!.from!.id == bot.botInfo.id) {
                const id = ctx.msg.reply_to_message!.text!.split("\n").slice(-1)[0];
                const message = ctx.message.text!; // проверено
                await bot.api.sendMessage(id,
`<b>${message}</b>\n
👤 ${ctx.from.first_name}`,
                  {parse_mode: "HTML"});
                }
             }
            
            catch (err) {
              await bot.api.sendMessage(config.targetGroupId, `<b>Ошибка:</b> <code>Отвечайте на "новое сообщение" при ответе пользователю!</code>`, {parse_mode: "HTML"});}

        }

        else {

            try {
                await ctx.api.leaveChat(ctx.chat.id);
                console.log(`Бот вышел из группы ${ctx.chat.id}`);
            }

            catch (error) {console.error(`Ошибка при выходе из группы ${ctx.chat.id}:`, error);}

        }
      }
});

bot.callbackQuery("ban", async (ctx) => {

  if (config.trustedUsers.includes(ctx.callbackQuery.from.id)) {

    const id = Number(ctx.callbackQuery.message!.text!.split("\n").slice(-1)[0]);

    if (ctx.callbackQuery.from.id === id) {
      await ctx.answerCallbackQuery({text: "Вы не можете себя заблокировать!"});
    } else if (config.banList.includes(id)) {
      await ctx.answerCallbackQuery({text: "Пользователь уже заблокирован!"});
    }
    else {
      config.banList.push(id);
      sync_yaml(config);

      await ctx.answerCallbackQuery({text: "Пользователь заблокирован"});
    }

  }
  else {await ctx.answerCallbackQuery({text: "Вы не можете управлять ботом"});}

});

bot.callbackQuery("unban", async (ctx) => {

  if (config.trustedUsers.includes(ctx.callbackQuery.from.id)) {

    const id = Number(ctx.callbackQuery.message!.text!.split("\n").slice(-1)[0]);

    if (config.banList.includes(id))  {

      delete config.banList[config.banList.indexOf(id)]
      sync_yaml(config);

      await ctx.answerCallbackQuery({text: "Пользователь разблокирован"});

    }
    else {await ctx.answerCallbackQuery({text: "Пользователь не заблокирован!"});}

  }

  else {await ctx.answerCallbackQuery({text: "Вы не можете управлять ботом"});}

});

bot.callbackQuery("delete", async (ctx) => {

  if (config.trustedUsers.includes(ctx.callbackQuery.from.id)) {

    await ctx.api.editMessageText(ctx.chat!.id, ctx.msgId!, `<i>👤 <a href="tg://user?id=${ctx.callbackQuery.from.id}">${ctx.callbackQuery.from.first_name}</a> удалил сообщение.</i>`, {parse_mode: "HTML"});
    await ctx.answerCallbackQuery({text: "Сообщение удалено"});

  }
  else {await ctx.answerCallbackQuery({text: "Вы не можете управлять ботом"});}

});

bot.start();